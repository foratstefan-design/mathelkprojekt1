import assert from 'node:assert/strict';
import {test} from 'node:test';
import {questionLayout,fitQuestion} from '../public/viewport.js';

test('question anchors keep the plane above the panel at common tablet/mobile heights',()=>{
  for(const [width,height] of [[1024,768],[768,1024],[390,700],[320,568],[1180,650]]){
    for(let density=0;density<=2;density++){
      const layout=questionLayout(width,height,density);
      const bottom=layout.centerY+layout.size*.6; // measured wobble/tilt envelope
      assert.ok(bottom<layout.top,`${width}×${height}, density ${density}`);
      assert.equal(layout.height,height);
    }
  }
});
test('fit stops at the first readable layout; exceptional overflow remains scrollable',()=>{
  let current,applied=[];
  assert.equal(fitQuestion(()=>[90,12,0][current],value=>{current=value;applied.push(value);}),2);
  assert.deepEqual(applied,[0,1,2]);
  applied=[];
  assert.equal(fitQuestion(()=>0,value=>{current=value;applied.push(value);}),0);
  assert.deepEqual(applied,[0]);
  applied=[];
  assert.equal(fitQuestion(()=>300,value=>{applied.push(value);},1),2);
  assert.deepEqual(applied,[1,2],'large text must not create a resize loop or crop text');
});
