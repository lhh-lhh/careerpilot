// Design handoff checks only. No browser, app, database, credential or network access.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const dir=path.dirname(fileURLToPath(import.meta.url));
const design=JSON.parse(fs.readFileSync(path.join(dir,'design-validation.json'),'utf8'));
const coverage=JSON.parse(fs.readFileSync(path.join(dir,'coverage-matrix.json'),'utf8'));
const failures=[];
const assert=(condition,label)=>{if(!condition)failures.push(label);};
for(const a of design.artifacts){
  assert(fs.existsSync(path.join(dir,a.name+'.svg')),'SVG missing: '+a.name);
  const meta=await sharp(path.join(dir,a.name+'.png')).metadata();
  assert(meta.width===a.width&&meta.height===a.height,'Wrong dimensions: '+a.name);
  const svg=fs.readFileSync(path.join(dir,a.name+'.svg'),'utf8');
  assert(svg.includes('Microsoft YaHei'),'Chinese font stack missing: '+a.name);
  assert(!/https?:\/\//.test(svg.replaceAll('http://www.w3.org/2000/svg','').replaceAll('http://www.w3.org/1999/xlink','')),'Remote asset: '+a.name);
}
assert(design.artifacts.length===16,'Expected sixteen representative designs');
assert(coverage.pages.length===54&&coverage.windows.length===43,'Coverage row count changed; review mapping');
const ids=coverage.pages.concat(coverage.windows).map(x=>x.id);
assert(new Set(ids).size===ids.length,'Duplicate coverage IDs');
for(const item of coverage.pages.concat(coverage.windows)){
  assert(Boolean(item.family&&item.layout&&item.preserve),'Missing mapping '+item.id);
  assert(fs.existsSync(path.join(dir,item.reference)),'Missing reference '+item.id);
  assert(item.executionStatus==='未实施'&&item.validationStatus==='待执行','Premature completion claim '+item.id);
}
assert(design.contrastWarnings.length===0,'Specified text color contrast needs correction');
for(const name of ['README.md','index.html','coverage-matrix.md','design-tokens.final-candidate.json'])assert(fs.existsSync(path.join(dir,name)),'Missing handoff '+name);
for(const file of ['../../superpowers/specs/2026-11-17-full-ui-refresh-final-design.md','../../superpowers/plans/2026-11-17-full-ui-refresh.md']){
  const text=fs.readFileSync(path.resolve(dir,file),'utf8');
  assert(!/\b(?:TODO|TBD)\b/.test(text),'Unresolved placeholder '+file);
}
const report={checkedAt:new Date().toISOString(),kind:'design file/dimension/mapping/selected-color validation only; not app tests',artifactCount:design.artifacts.length,pageRows:coverage.pages.length,windowGroups:coverage.windows.length,contrastPairs:design.contrast.length,contrastWarnings:design.contrastWarnings.length,failures,passed:failures.length===0,limitations:['No runtime/browser layout, interaction, accessibility or performance claim','Coverage mapping is not implementation completeness','Figma result unverified','Source hash verification is a separate report']};
fs.writeFileSync(path.join(dir,'handoff-check.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(failures.length)process.exitCode=1;
