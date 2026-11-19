import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
// Run from repository root. Sources are ignored originals; do not fetch or regenerate them here.
// Provenance/attempt log is in ../career-media-manifest.json. This writes only derived assets
// and the work-directory manifest; review hashes before accepting any regeneration.
await fs.mkdir('work/reference-fidelity',{recursive:true});
const out='public/media/career';await fs.mkdir(out,{recursive:true});
const records=[];
async function save(source,file,extract,resize){
 const meta=await sharp(source).metadata();let image=sharp(source);if(extract)image=image.extract(extract);if(resize)image=image.resize(resize);const data=await image.webp({quality:88}).toBuffer();
 const dest=path.join(out,file);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,data);
 const actual=await sharp(data).metadata();records.push({file:'/media/career/'+file,source,width:actual.width,height:actual.height,sourceDimensions:[meta.width,meta.height],crop:extract??null,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
}
for(const name of ['portal-banner','jobs-banner','practice-banner'])if(await fs.stat(`outputs/reference-fidelity/${name}.png`).catch(()=>null))await save(`outputs/reference-fidelity/${name}.png`,name+'.webp',null,{width:1920,withoutEnlargement:true});
const jobs=['frontend','backend','analytics','operations','algorithm','testing','engineering','design','finance','education','health','logistics'];
const service=['recruitment','internship','guidance','policy','safety','resume','matching','interview'];
const features=[['overview','resume','suggestions','optimize','ocr','preview','applications','destination','text','voice','feedback','records'],['company','publishing','candidates','agreements','schedule','students','review','dashboard','support','admin','accounts','governance'],['tickets','data','account','login','register','company-register','notfound','forbidden','connection','notifications','help','certificates']];
async function atlas(source,names,cols,rows,prefix){const meta=await sharp(source).metadata();for(let i=0;i<names.length;i++){const col=i%cols,row=Math.floor(i/cols),left=Math.round(meta.width*col/cols),top=Math.round(meta.height*row/rows);await save(source,prefix+names[i]+'.webp',{left,top,width:Math.round(meta.width*(col+1)/cols)-left,height:Math.round(meta.height*(row+1)/rows)-top},{width:600,withoutEnlargement:true});}}
for(const [i,letter] of ['a','b','c'].entries()){
 const source=`outputs/reference-fidelity/job-atlas-${letter}.png`;if(await fs.stat(source).catch(()=>null))await atlas(source,jobs.map(n=>n+'-'+(i+1)),4,3,'jobs/');
 const feature=`outputs/reference-fidelity/features-atlas-${letter}.png`;if(await fs.stat(feature).catch(()=>null))await atlas(feature,features[i],4,3,'features/');
}
if(await fs.stat('outputs/reference-fidelity/services-atlas.png').catch(()=>null))await atlas('outputs/reference-fidelity/services-atlas.png',service,4,2,'services/');
// User-provided design illustrations are cropped only from the image area;
// all titles, descriptions and controls remain native, editable HTML.
const practiceReference='D:/Temp/codex-clipboard-cb32824b-a3fc-40bb-88db-69467aba30c5.png';
for(const [name,left,width] of [['analyst',201,409],['backend',630,413],['frontend',1065,430]])
 await save(practiceReference,`practice-${name}.webp`,{left,top:383,width,height:213},null);
if(await fs.stat('outputs/reference-fidelity/brand.png').catch(()=>null)){
 const original='outputs/reference-fidelity/brand.png';
 const originalMeta=await sharp(original).metadata();
 // Mechanical white-background removal; no new generated content.
 const {data,info}=await sharp(original).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 for(let i=0;i<data.length;i+=4){const m=Math.min(data[i],data[i+1],data[i+2]),M=Math.max(data[i],data[i+1],data[i+2]);data[i+3]=m>210&&M-m<22?0:255;}
 const cleaned=await sharp(data,{raw:info}).trim({background:'#ffffff00',threshold:15}).png().toBuffer();
 await save(cleaned,'brand.webp',null,{width:160});records.at(-1).source=original;records.at(-1).processedDimensionsBeforeResize=records.at(-1).sourceDimensions;records.at(-1).sourceDimensions=[originalMeta.width,originalMeta.height];
}
await fs.writeFile('work/reference-fidelity/media-manifest.json',JSON.stringify({provider:'Nebula',model:'gpt-image-2.6',recordedAt:new Date().toISOString(),records},null,2));console.log('prepared',records.length,'assets',records.reduce((s,r)=>s+r.bytes,0),'bytes');
