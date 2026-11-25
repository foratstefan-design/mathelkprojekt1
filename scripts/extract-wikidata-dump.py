#!/usr/bin/env python3
"""Extract quiz-safe facts from a bounded prefix of the official Wikidata dump.

No network access. BZip2 output is drained in bounded blocks and only complete
newline-delimited entity objects are consumed. A partial final BZip2 member is
allowed; truncated JSON tails are reported and never interpreted as entities.
"""
from __future__ import annotations

import argparse
import bz2
from collections import Counter
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
import io
import json
import math
import os
from pathlib import Path
import re
import sys
from typing import Any, BinaryIO, Iterator

INPUT_BLOCK = 256 * 1024
OUTPUT_BLOCK = 1024 * 1024
MAX_ENTITY_LINE = 32 * 1024 * 1024
QID = re.compile(r"^Q[1-9][0-9]*$")
GREGORIAN = "Q1985727"
TARGET_PROPERTIES = ("P36", "P17", "P50", "P57", "P364", "P495",
                     "P577", "P571", "P2044", "P2048", "P2046", "P2043")
RELATIONS = {
    "P36": ("Geografie", "hauptstadt"),
    "P17": ("Geografie", "staat"),
    "P50": ("Literatur", "autor"),
    "P57": ("Film", "regie"),
    "P364": ("Kultur", "originalsprache"),
    "P495": ("Film", "ursprungsland"),
}
QUANTITIES = {
    "P2044": ("Meereshöhen", "hoehe-ueber-meer"),
    "P2048": ("Bauwerkshöhen", "hoehe"),
    "P2046": ("Flächen", "flaeche"),
    "P2043": ("Längen", "laenge"),
}
UNITS = {
    "Q11573": ("m", Decimal("1")),
    "Q828224": ("m", Decimal("1000")),
    "Q174728": ("m", Decimal("0.01")),
    "Q174789": ("m", Decimal("0.001")),
    "Q3710": ("m", Decimal("0.3048")),
    "Q25343": ("km²", Decimal("0.000001")),
    "Q712226": ("km²", Decimal("1")),
    "Q35852": ("km²", Decimal("0.01")),
}
FILM_CLASSES = {"Q11424", "Q24862", "Q202866", "Q229390", "Q506240"}
ORGANIZATION_CLASSES = {
    "Q43229", "Q4830453", "Q3918", "Q847017", "Q476028", "Q688151",
    "Q178706", "Q163740", "Q2385804", "Q7278", "Q215380", "Q2085381",
}
ORGANIZATION_WORDS = re.compile(
    r"\b(unternehmen|organisation|universität|hochschule|verein|institut|partei|"
    r"verband|verlag|schule|gemeinde|stadt|dorf|kloster|kirche|theater|museum|"
    r"bibliothek|oper|orchester|zeitung|zeitschrift|band|fußballclub|sportclub|"
    r"stiftung|fernsehsender|radiosender|company|organization|university|"
    r"school|association|institution|city|village|monastery|church|newspaper)\b",
    re.IGNORECASE,
)
FILM_WORDS = re.compile(
    r"\b(film|spielfilm|kinofilm|stummfilm|fernsehfilm|animationsfilm|"
    r"kurzfilm|documentary|feature film)\b", re.IGNORECASE
)


def entity_label(entity: dict[str, Any]) -> str | None:
    labels = entity.get("labels") or {}
    candidates = [
        (labels.get("de") or {}).get("value"),
        ((entity.get("sitelinks") or {}).get("dewiki") or {}).get("title"),
        (labels.get("en") or {}).get("value"),
    ]
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip().replace("_", " ")
    return None


def retained_statements(entity: dict[str, Any], prop: str, all_current_ranks: bool = False) -> list[dict[str, Any]]:
    """Best current rank, with no unknown/deprecated/ended/partial values."""
    candidates = []
    for statement in (entity.get("claims") or {}).get(prop, []):
        if not isinstance(statement, dict) or statement.get("rank") == "deprecated":
            continue
        snak = statement.get("mainsnak") or {}
        qualifiers = statement.get("qualifiers") or {}
        if snak.get("snaktype") != "value" or "value" not in (snak.get("datavalue") or {}):
            continue
        if "P582" in qualifiers or "P518" in qualifiers:
            continue
        candidates.append(statement)
    if all_current_ranks:
        return candidates
    preferred = [s for s in candidates if s.get("rank") == "preferred"]
    return preferred or [s for s in candidates if s.get("rank", "normal") == "normal"]


def statement_value(statement: dict[str, Any]) -> Any:
    return statement["mainsnak"]["datavalue"]["value"]


def object_id(value: Any) -> str | None:
    if not isinstance(value, dict) or value.get("entity-type") != "item":
        return None
    item_id = value.get("id")
    if not item_id and isinstance(value.get("numeric-id"), int):
        item_id = "Q" + str(value["numeric-id"])
    return item_id if isinstance(item_id, str) and QID.fullmatch(item_id) else None


def instance_ids(entity: dict[str, Any]) -> set[str]:
    return {item_id for s in retained_statements(entity, "P31")
            if (item_id := object_id(statement_value(s)))}


def is_film(entity: dict[str, Any], classes: set[str]) -> bool:
    if "Q5" in classes:
        return False
    description = " ".join((entity.get("descriptions", {}).get(lang) or {}).get("value", "")
                           for lang in ("de", "en"))
    return bool(classes & FILM_CLASSES or FILM_WORDS.search(description))


def is_organization_or_place(entity: dict[str, Any], classes: set[str]) -> bool:
    description = " ".join((entity.get("descriptions", {}).get(lang) or {}).get("value", "")
                           for lang in ("de", "en"))
    return bool(classes & ORGANIZATION_CLASSES or ORGANIZATION_WORDS.search(description))


def date_value(value: Any, as_of: date) -> tuple[int, str] | None:
    if not isinstance(value, dict) or value.get("precision", 0) < 9:
        return None
    calendar = str(value.get("calendarmodel", "")).rsplit("/", 1)[-1]
    if calendar != GREGORIAN:
        return None
    raw = value.get("time")
    if not isinstance(raw, str):
        return None
    match = re.match(r"^\+([0-9]+)-([0-9]{2})-([0-9]{2})T", raw)
    if not match:
        return None
    year, month, day = map(int, match.groups())
    if not 1 <= year <= as_of.year:
        return None
    if year == as_of.year and value.get("precision", 0) >= 10:
        if month > as_of.month:
            return None
        if month == as_of.month and value.get("precision", 0) >= 11 and day > as_of.day:
            return None
    return year, raw


def quantity_value(value: Any) -> tuple[Decimal, str, str, str] | None:
    if not isinstance(value, dict):
        return None
    unit_id = str(value.get("unit", "")).rsplit("/", 1)[-1]
    conversion = UNITS.get(unit_id)
    if conversion is None:
        return None
    try:
        amount = Decimal(str(value["amount"]))
    except (InvalidOperation, KeyError, ValueError):
        return None
    if not amount.is_finite() or amount <= 0:
        return None
    unit, factor = conversion
    normalized = amount * factor
    if not math.isfinite(float(normalized)):
        return None
    return normalized, unit, str(amount), unit_id


def base_fact(entity: dict[str, Any], prop: str, scope: str, category: str,
              statements: list[dict[str, Any]], retrieved_at: str) -> dict[str, Any]:
    item_id = entity["id"]
    statement_ids = [s["id"] for s in statements if isinstance(s.get("id"), str)]
    result: dict[str, Any] = {
        "key": "wd:" + item_id + ":" + prop + ":" + scope,
        "subjectId": item_id,
        "subjectLabel": entity_label(entity),
        "propertyId": prop,
        "category": category,
        "scope": scope,
        "sitelinks": len(entity.get("sitelinks") or {}),
        "sourceUrl": "https://www.wikidata.org/wiki/" + item_id,
        "statementId": statement_ids[0] if statement_ids else None,
        "statementIds": statement_ids,
        "revisionId": entity.get("lastrevid"),
        "sourceQuery": "official-json-dump",
        "retrievedAt": retrieved_at,
    }
    description = (entity.get("descriptions", {}).get("de") or {}).get("value")
    if description:
        result["subjectDescription"] = description
    return result


def extract_entity_facts(entity: dict[str, Any], retrieved_at: str,
                         as_of: date, skipped: Counter[str]) -> list[dict[str, Any]]:
    facts = []
    classes = instance_ids(entity)
    if classes & {"Q4167410", "Q13406463"}:
        skipped["disambiguation_or_list"] += 1
        return facts
    film = is_film(entity, classes)
    for prop in TARGET_PROPERTIES:
        statements = retained_statements(entity, prop, all_current_ranks=prop in RELATIONS or prop == "P577")
        if not statements:
            continue
        if prop in RELATIONS:
            if prop == "P17" and not retained_statements(entity, "P625"):
                skipped["country_without_coordinates"] += 1
                continue
            if prop == "P495" and not film:
                skipped["origin_not_film"] += 1
                continue
            values: dict[str, list[dict[str, Any]]] = {}
            for statement in statements:
                item_id = object_id(statement_value(statement))
                if item_id:
                    values.setdefault(item_id, []).append(statement)
            if len(values) != 1:
                skipped["ambiguous_or_missing_relation"] += 1
                continue
            item_id, sources = next(iter(values.items()))
            if item_id == entity["id"]:
                skipped["self_relation"] += 1
                continue
            category, scope = RELATIONS[prop]
            fact = base_fact(entity, prop, scope, category, sources, retrieved_at)
            fact.update(kind="relation", objectId=item_id)
            facts.append(fact)
        elif prop in {"P577", "P571"}:
            if prop == "P571" and not is_organization_or_place(entity, classes):
                skipped["inception_not_organization_or_place"] += 1
                continue
            values = []
            for statement in statements:
                parsed = date_value(statement_value(statement), as_of)
                if parsed:
                    values.append((parsed[0], parsed[1], statement))
            if not values:
                skipped["date_without_precise_gregorian_year"] += 1
                continue
            years = {value[0] for value in values}
            if prop == "P571" and len(years) != 1:
                skipped["ambiguous_inception_year"] += 1
                continue
            earliest = min(value[0] for value in values)
            selected = [value for value in values if value[0] == earliest]
            category = ("Film" if film else "Literatur" if any(
                word in (entity.get("descriptions", {}).get("de") or {}).get("value", "").lower()
                for word in ("roman", "buch", "gedicht", "novelle", "literatur")) else "Kultur") if prop == "P577" else "Gründungen"
            scope = "frueheste-veroeffentlichung" if prop == "P577" else "gruendungsjahr"
            fact = base_fact(entity, prop, scope, category,
                             [value[2] for value in selected], retrieved_at)
            fact.update(kind="date", value=earliest, unit="year",
                        dateValue=min(value[1] for value in selected),
                        datePrecision=min(statement_value(value[2])["precision"] for value in selected))
            facts.append(fact)
        else:
            values: dict[tuple[Decimal, str], list[tuple[Any, dict[str, Any]]]] = {}
            for statement in statements:
                parsed = quantity_value(statement_value(statement))
                if parsed:
                    values.setdefault((parsed[0], parsed[1]), []).append((parsed, statement))
            if len(values) != 1:
                skipped["ambiguous_or_unsupported_quantity"] += 1
                continue
            (amount, unit), sources = next(iter(values.items()))
            category, scope = QUANTITIES[prop]
            fact = base_fact(entity, prop, scope, category,
                             [source[1] for source in sources], retrieved_at)
            fact.update(kind="quantity", value=float(amount), unit=unit,
                        originalAmount=sources[0][0][2],
                        originalUnit=sources[0][0][3])
            facts.append(fact)
    return facts


def decompressed_blocks(handle: BinaryIO, stats: dict[str, Any]) -> Iterator[bytes]:
    decoder = bz2.BZ2Decompressor()
    pending = b""
    while True:
        if decoder.eof:
            pending = decoder.unused_data
            if not pending:
                pending = handle.read(INPUT_BLOCK)
                stats["compressedBytesRead"] += len(pending)
                if not pending:
                    stats["bzipComplete"] = True
                    return
            decoder = bz2.BZ2Decompressor()
        if decoder.needs_input:
            if not pending:
                pending = handle.read(INPUT_BLOCK)
                stats["compressedBytesRead"] += len(pending)
            if not pending:
                stats["bzipComplete"] = False
                return
            data, pending = pending, b""
        else:
            data = b""
        # max_length prevents a high-compression block from producing the full
        # decompressed prefix at once. Drain buffered output before reading more.
        block = decoder.decompress(data, max_length=OUTPUT_BLOCK)
        if block:
            yield block


def complete_entities(handle: BinaryIO, stats: dict[str, Any]) -> Iterator[dict[str, Any]]:
    buffer = b""
    discard_oversize_tail = False
    for chunk in decompressed_blocks(handle, stats):
        lines = (buffer + chunk).split(b"\n")
        buffer = lines.pop()
        for line in lines:
            if discard_oversize_tail:
                discard_oversize_tail = False
                continue
            line = line.strip().rstrip(b",")
            if not line.startswith(b"{"):
                continue
            if len(line) > MAX_ENTITY_LINE:
                stats["oversizeEntityLines"] += 1
                continue
            try:
                entity = json.loads(line)
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                raise ValueError("Malformed complete JSON entity line in dump prefix") from error
            if isinstance(entity, dict) and entity.get("id"):
                yield entity
        if len(buffer) > MAX_ENTITY_LINE:
            stats["oversizeEntityLines"] += 1
            buffer = b""
            discard_oversize_tail = True
    stats["partialTailBytes"] = len(buffer)
    # Do not parse a valid-looking tail without a newline: it may be truncated.


def extract(input_path: Path, output_path: Path, *, min_sitelinks: int = 8,
            retrieved_at: str | None = None, as_of: date | None = None,
            max_entities: int | None = None, progress_every: int = 1000) -> dict[str, Any]:
    retrieved_at = retrieved_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    as_of = as_of or date.today()
    stats: dict[str, Any] = {
        "entitiesRead": 0, "itemEntities": 0, "germanEntities": 0,
        "eligibleGermanEntities": 0, "compressedBytesRead": 0,
        "bzipComplete": False, "partialTailBytes": 0,
        "oversizeEntityLines": 0, "lastEntityId": None,
    }
    labels: dict[str, str] = {}
    facts: list[dict[str, Any]] = []
    skipped: Counter[str] = Counter()
    properties: Counter[str] = Counter()
    with input_path.open("rb") as handle:
        for entity in complete_entities(handle, stats):
            stats["entitiesRead"] += 1
            stats["lastEntityId"] = entity.get("id")
            label = entity_label(entity)
            if label:
                labels[entity["id"]] = label
            if entity.get("type") == "item" and QID.fullmatch(str(entity.get("id", ""))):
                stats["itemEntities"] += 1
                if "dewiki" in (entity.get("sitelinks") or {}):
                    stats["germanEntities"] += 1
                    if len(entity.get("sitelinks") or {}) >= min_sitelinks and label:
                        stats["eligibleGermanEntities"] += 1
                        extracted = extract_entity_facts(entity, retrieved_at, as_of, skipped)
                        facts.extend(extracted)
                        properties.update(fact["propertyId"] for fact in extracted)
            if progress_every and stats["entitiesRead"] % progress_every == 0:
                print(json.dumps({"entitiesRead": stats["entitiesRead"],
                                  "germanEntities": stats["germanEntities"],
                                  "facts": len(facts)}, ensure_ascii=False),
                      file=sys.stderr, flush=True)
            if max_entities is not None and stats["entitiesRead"] >= max_entities:
                stats["stoppedAtEntityLimit"] = True
                break
    missing = set()
    for fact in facts:
        if fact["kind"] == "relation":
            target = labels.get(fact["objectId"])
            if target:
                fact["objectLabel"] = target
            else:
                missing.add(fact["objectId"])
    result = {
        **stats, "retrievedAt": retrieved_at, "license": "CC0-1.0",
        "minSitelinks": min_sitelinks, "labels": labels, "facts": facts,
        "missingObjectIds": sorted(missing, key=lambda item: int(item[1:])),
        "properties": dict(properties), "skipped": dict(skipped),
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_name(output_path.name + ".tmp-" + str(os.getpid()))
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    temporary.replace(output_path)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", default=Path(".wikidata-cache/extracted.json"), type=Path)
    parser.add_argument("--min-sitelinks", default=8, type=int)
    parser.add_argument("--retrieved-at")
    parser.add_argument("--as-of-date", type=date.fromisoformat)
    parser.add_argument("--max-entities", type=int)
    parser.add_argument("--progress-every", default=1000, type=int)
    args = parser.parse_args()
    if args.min_sitelinks < 0:
        parser.error("--min-sitelinks must not be negative")
    if args.max_entities is not None and args.max_entities < 1:
        parser.error("--max-entities must be positive")
    result = extract(args.input, args.output, min_sitelinks=args.min_sitelinks,
                     retrieved_at=args.retrieved_at, as_of=args.as_of_date,
                     max_entities=args.max_entities, progress_every=args.progress_every)
    print(json.dumps({key: result[key] for key in (
        "entitiesRead", "germanEntities", "eligibleGermanEntities",
        "compressedBytesRead", "bzipComplete", "partialTailBytes", "properties"
    )}, ensure_ascii=False))
    print(json.dumps({"facts": len(result["facts"]),
                      "labels": len(result["labels"]),
                      "missingObjectIds": len(result["missingObjectIds"]),
                      "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
