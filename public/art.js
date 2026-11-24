/** Original coral-and-cream pixel biplane; the canvas uses the same sprite. */
export const PLANE_PALETTE = { '.':null, O:'#183b51', B:'#f38fa8', S:'#cb5d83', H:'#ffd5c7', C:'#fff0ce', W:'#c4eff0', N:'#638ea6', P:'#a9d9d2' };
export const PLANE_SPRITE = [
'................................................',
'....................OOOOOOOOOOOOOO..............',
'...................OHHHHHHHHHHHHHHO.............',
'.................OOOCCCCCCCCCCCCCCOOO...........',
'....................OOOOSOOOOO..................',
'....OOOO...............OSO...OO..................',
'....OBBO...............OSO..OWWO.................',
'....OBBBO..............OSO..OWWO........O........',
'....OBBBBO..........OOOOSOOOOOOO.......OP.......',
'....OBBBBBOOOOOOOOOOHHHHHHHHHHHHOO.....OP.......',
'....OBBBBBBBBBBBBBBBBBBBBBBBBBBBBBOOOOOP.......',
'...OHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHNO.......',
'..OCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCNOOO......',
'...OSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSNO.......',
'....OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOP.......',
'............OOOOSOOOOOOOOOOO..........OP.......',
'..........OHHHHHHHHHHHHHHHHHHO........O........',
'.........OCCCCCCCCCCCCCCCCCCCCO.................',
'..........OOOOOOOOOOOOOOOOOOOO..................',
'................OO......OO......................',
'...............ONNO....ONNO.....................',
'................OO......OO......................',
].map(row=>row.padEnd(48,'.').slice(0,48));
export function plane(className='') {
  const safe=String(className).replace(/[^a-zA-Z0-9 _-]/g,'');
  const rects=[];
  for(let y=0;y<PLANE_SPRITE.length;y++) for(let x=0;x<48;) {
    const c=PLANE_SPRITE[y][x];if(!PLANE_PALETTE[c]){x++;continue;}
    let end=x+1;while(end<48&&PLANE_SPRITE[y][end]===c)end++;
    rects.push(`<rect x="${x*3}" y="${y*3+30}" width="${(end-x)*3}" height="3" fill="${PLANE_PALETTE[c]}"/>`);x=end;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 126" class="pixel-plane ${safe}" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><g class="plane-body">${rects.join('')}</g></svg>`;
}
export const hero=plane('hero-plane');
export const badge=()=>plane('badge-plane');
