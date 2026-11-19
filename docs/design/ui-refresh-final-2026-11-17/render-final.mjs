// Design-only authoring. Reads local design/source assets; no app imports,
// network, AI, database or credential access. Writes only this design folder.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const dir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(dir,'../../..');
const prior=path.join(dir,'../ui-refresh-2026-11-16');
const themes=JSON.parse(fs.readFileSync(path.join(prior,'design-tokens.proposed.json'),'utf8')).themes;
// Proposed v1.0 secondary text is darker to stay legible on stronger light backgrounds.
themes.light['--text-2']='#42516c';
const photo='data:image/jpeg;base64,'+fs.readFileSync(path.join(root,'public/media/campus-ai.jpg')).toString('base64');
const iconSource=fs.readFileSync(path.join(root,'src/components/base/AppIcon.vue'),'utf8');
const icons=Object.fromEntries([...iconSource.matchAll(/(\w+):\s*"([^"]+)"/g)].map(m=>[m[1],m[2]]));
let out=[],t,dark=false;const artifacts=[];
const esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const palette={
  campus:['#d6e3ff','#c1e9e5'],journey:['#d5e3fb','#ccebe7'],paper:['#e0e4fa','#ddd7ed'],
  studio:['#ddd8f7','#c9dcf6'],pipeline:['#cae5f0','#c7e8e3'],analytics:['#d5e1fb','#d3e8ef'],
  governance:['#d9e1ed','#d5e7e5'],service:['#d2e8f2','#e0e7fb'],status:['#e2e6f5','#cfe8e6'],
};
function r(x,y,w,h,fill=t['--surface'],stroke='',rx=14,extra=''){out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" rx="${rx}" ${stroke?`stroke="${stroke}"`:''} ${extra}/>`);}
function tx(x,y,s,size=14,color=t['--text-1'],weight=400,extra=''){out.push(`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}" ${extra}>${esc(s)}</text>`);}
function ln(x,y,x2,y2,color=t['--border'],width=1,extra=''){out.push(`<path d="M${x} ${y} L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}" ${extra}/>`);}
function ic(name,x,y,size=20,color=t['--brand-text']){out.push(`<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${icons[name]||icons.arrow}"/></svg>`);}
function dot(x,y,rad=4,color=t['--brand-text'],extra=''){out.push(`<circle cx="${x}" cy="${y}" r="${rad}" fill="${color}" ${extra}/>`);}
function begin(w,h,isDark=false){dark=isDark;t=themes[isDark?'dark':'light'];out=[`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><title>路鸣职引最终设计候选 v1.0 · 静态设计非产品截图</title><style>text{font-family:'Microsoft YaHei','Noto Sans SC',sans-serif}.num{font-variant-numeric:tabular-nums}</style><defs><filter id="lift" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="8" stdDeviation="14" flood-color="#16233a" flood-opacity=".10"/></filter></defs>`];r(0,0,w,h,t['--bg-base'],'',0);}
function bg(x,y,w,h,family='journey'){
  const p=dark?['#24395c','#194449']:palette[family];
  const key=`bg-${out.length}`;
  out.push(`<defs><linearGradient id="${key}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${p[0]}"/><stop offset="1" stop-color="${p[1]}"/></linearGradient><pattern id="${key}-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="${dark?'#718bbb':'#7594c4'}" stroke-opacity=".20"/></pattern><clipPath id="${key}-clip"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20"/></clipPath></defs>`);
  r(x,y,w,h,`url(#${key})`,'',20);
  out.push(`<g clip-path="url(#${key}-clip)" aria-hidden="true">`);
  if(['analytics','governance','pipeline'].includes(family))r(x,y,w,h,`url(#${key}-grid)`,'',0);
  if(family==='paper'){
    for(let i=0;i<3;i++)r(x+w*.48+i*18,y+22+i*12,w*.43,h*.84,dark?'#293550':'#f0f1fc',dark?'#47506a':'#b7bde0',12,`transform="rotate(${i*3-7} ${x+w*.72} ${y+h*.5})"`);
  }else if(family==='studio'){
    for(let i=0;i<6;i++)out.push(`<ellipse cx="${x+w*.68}" cy="${y+h*.45}" rx="${w*(.14+i*.065)}" ry="${h*(.14+i*.08)}" fill="none" stroke="${dark?'#9b87f5':'#8a85c7'}" stroke-width="1.5" opacity=".28"/>`);
  }else if(family==='analytics'){
    for(let i=0;i<4;i++)out.push(`<path d="M${x-40} ${y+h*(.35+i*.12)} L${x+w*.28} ${y+h*(.25+i*.12)} L${x+w*.52} ${y+h*(.4+i*.12)} L${x+w*1.1} ${y+h*(.1+i*.12)}" fill="none" stroke="${dark?'#638abd':'#749ac6'}" stroke-width="2" opacity=".24"/>`);
  }else if(family==='pipeline'){
    for(let i=0;i<4;i++){const yy=y+h*(.18+i*.22);out.push(`<path d="M${x-20} ${yy} H${x+w*.36} L${x+w*.43} ${yy+24} H${x+w+20}" fill="none" stroke="${dark?'#5ca6ac':'#72a5b7'}" stroke-width="2" opacity=".30"/>`);dot(x+w*.36,yy,5,dark?'#70cbbd':'#3e8f9b','opacity=".45"');}
  }else if(family==='governance'){
    for(let i=0;i<4;i++)r(x+w*(.08+i*.23),y+h*.12,w*.18,h*.76,'none',dark?'#638a9d':'#91a9bb',18,'stroke-width="2" opacity=".32"');
  }else if(family==='service'){
    for(let i=0;i<3;i++)out.push(`<circle cx="${x+w*(.2+i*.3)}" cy="${y+h*.5}" r="${h*(.24+i*.07)}" fill="none" stroke="${dark?'#638abd':'#739dc0'}" stroke-width="2" opacity=".32"/>`);
  }else if(family==='status'){
    for(let i=0;i<5;i++)out.push(`<path d="M${x-20} ${y+h*(.4+i*.09)} Q${x+w*.45} ${y-h*.2+i*h*.08} ${x+w+20} ${y+h*(.4+i*.09)}" fill="none" stroke="${dark?'#638abd':'#83a4bd'}" stroke-width="2" opacity=".32"/>`);
  }else{
    for(let i=0;i<4;i++)out.push(`<path d="M${x-w*.12} ${y+h*(.65+i*.09)} C${x+w*.26} ${y+h*.1} ${x+w*.58} ${y+h*1.5} ${x+w*1.14} ${y+h*(.3+i*.16)}" fill="none" stroke="${dark?'#6c93dd':'#729bc9'}" stroke-width="${i===0?3:1.4}" opacity=".26" ${i===2?'stroke-dasharray="6 9"':''}/>`);
    [0.22,.56,.81].forEach((v,i)=>dot(x+w*v,y+h*(.24+i*.25),5,dark?'#70cbbd':'#3e8f9b','opacity=".6"'));
  }
  out.push('</g>');
}
function mark(x,y,s=64){
  r(x,y,s,s,dark?'#2b3f69':'#e5edff',dark?'#657ab4':'#a8bbed',s*.27);
  out.push(`<svg x="${x+4}" y="${y+4}" width="${s-8}" height="${s-8}" viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill="none" stroke="${t['--brand-text']}" opacity=".25"/><path d="M8 31 C13 27 13 22 18 19 S27 13 31 9" fill="none" stroke="${t['--brand-text']}" stroke-width="1.5" stroke-dasharray="2.5 3" stroke-linecap="round"/><path d="M10 15 Q13 11 16 15 M12 19 Q16 14 20 19" fill="none" stroke="${t['--brand-text']}" stroke-width="1.3" stroke-linecap="round" opacity=".75"/><circle cx="31" cy="9" r="2.6" fill="${t['--ai']}"/><path d="M28 6 L28 3 M33 12 L36 12" stroke="${t['--brand-text']}" stroke-width="1.2" stroke-linecap="round" opacity=".6"/></svg>`);
}
function brand(x,y,s=64,fsz=36,slogan=true){mark(x,y,s);tx(x+s+16,y+fsz,'路鸣职引',fsz,t['--brand-text'],700,'letter-spacing="1.2"');tx(x+s+18,y+fsz+24,'CareerPilot',14,t['--text-2'],600,'letter-spacing="1.5"');if(slogan){ln(x+304,y+9,x+304,y+57,t['--border-control']);tx(x+328,y+35,'闻鸣知路，循引赴职。',17,t['--brand-text'],600);}}
function btn(x,y,w,label,primary=false,h=44){const danger=label==='确认驳回',disabled=label==='不可用',loading=label==='处理中…',pressed=label==='按下反馈';const fill=danger?t['--danger-soft']:disabled?t['--disabled-bg']:pressed?t['--brand-700']:primary?t['--brand']:t['--surface'];const fg=danger?t['--danger-text']:disabled?t['--disabled-fg']:pressed||primary?'#fff':t['--text-1'];r(x,y,w,h,fill,danger?t['--danger-text']:primary||pressed?'':t['--border-control'],10);if(label==='☾'||label==='☀'){ic(label==='☾'?'moon':'sun',x+(w-20)/2,y+(h-20)/2,20,fg);return;}if(loading)out.push(`<circle cx="${x+26}" cy="${y+h/2}" r="7" fill="none" stroke="${t['--brand-text']}" stroke-width="2" stroke-dasharray="30 14"/>`);tx(x+w/2,y+h/2+5,label,14,fg,600,'text-anchor="middle"');}
function entry(x,y,w,h,title,note='',icon='arrow'){
  r(x,y,w,h,t['--surface'],t['--border'],14);r(x+14,y+14,36,36,t['--brand-soft'],'',10);ic(icon,x+22,y+22,20);tx(x+64,y+36,title,16,t['--text-1'],600);if(note)tx(x+18,y+h-18,note,13,t['--text-2']);ic('arrow',x+w-34,y+26,18);
}
function panel(x,y,w,h,title,note=''){r(x,y,w,h,t['--surface'],t['--border']);tx(x+24,y+35,title,19,t['--text-1'],600);if(note)tx(x+24,y+60,note,13,t['--text-2']);}
function field(x,y,w,label,value='',h=44){tx(x,y,label,14,t['--text-1'],600);r(x,y+12,w,h,t['--surface'],t['--border-control'],10);tx(x+14,y+40,value,15,t['--text-2']);}
function foot(h,label='最终设计候选 v1.0'){tx(32,h-12,`${label} · 静态设计 / 合成排版内容 / 非运行截图 / 业务与 AI 不变`,12,t['--text-2']);}
async function save(name,w,h,note){out.push('</svg>');const s=out.join('\n');fs.writeFileSync(path.join(dir,name+'.svg'),s);await sharp(Buffer.from(s)).png().toFile(path.join(dir,name+'.png'));artifacts.push({name,width:w,height:h,note});}
function campusImage(x,y,w,h){const id='photo-'+out.length;out.push(`<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20"/></clipPath></defs><image x="${x}" y="${y}" width="${w}" height="${h}" href="${photo}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`);}

async function portal(isDark=false){const w=1440,h=1740;begin(w,h,isDark);
  bg(20,126,1400,444,'campus');bg(20,585,1400,424,'journey');bg(20,1032,1400,180,'service');bg(20,1234,1400,206,'paper');bg(20,1462,1400,156,'pipeline');
  r(0,0,w,112,t['--surface'],'',0);brand(56,24);btn(840,35,128,'岗位机会');btn(980,35,128,'就业服务');btn(1124,35,44,isDark?'☀':'☾');btn(1192,35,192,'登录工作台',true);ln(56,111,1384,111);
  tx(72,179,'从校园出发 / CAREERPILOT',12,t['--brand-text'],600);tx(72,259,'让下一步，',56,t['--text-1'],600);tx(72,331,'更有方向。',56,t['--text-1'],600);tx(72,380,'连接值得奔赴的未来，也看见当下可做的准备。',16,t['--text-1']);
  r(72,407,610,60,t['--surface'],t['--border-control'],12,'filter="url(#lift)"');ic('search',91,426,22);tx(130,444,'岗位、企业或专业',16,t['--text-2']);btn(566,415,108,'搜索',true);btn(72,489,194,'做好求职准备');r(742,159,634,378,t['--surface'],'',24,'filter="url(#lift)"');campusImage(750,167,618,362);
  tx(72,633,'发现新的可能',28,t['--text-1'],600);btn(1236,601,132,'查看全部');
  ['前端开发工程师','数据分析助理','产品运营专员'].forEach((a,i)=>{const y=665+i*98;r(72,y,1296,86,t['--surface'],t['--border']);r(90,y+18,48,48,t['--brand-soft'],'',12);ic('company',103,y+31,22);tx(158,y+33,a,18,t['--text-1'],600);tx(158,y+60,['青屿数字（虚构）','知行智造（虚构）','云帆服务（虚构）'][i],13,t['--text-2']);tx(680,y+48,['上海 · 本科','杭州 · 本科','南京 · 本科'][i],14,t['--text-2']);tx(960,y+48,`${9+i}–${13+i}K / 月`,18,t['--brand-text'],600);tx(1140,y+48,'本站办理',13,t['--brand-text']);ic('arrow',1322,y+34);});tx(72,985,'岗位为虚构排版样例；实际来源、条数、资格和跳转语义不变。',12,t['--text-2']);
  tx(72,1090,'就业服务，触手可及。',25,t['--text-1'],600);tx(72,1123,'国家大学生就业服务平台',14,t['--text-2']);
  ['专场招聘','实习岗位','就业指导','就业政策','求职风险提示'].forEach((s,i)=>{const x=750+(i%3)*210,y=1050+Math.floor(i/3)*74;r(x,y,198,60,t['--surface'],t['--border'],12);ic(['jobs','company','help','agreement','warning'][i],x+14,y+21,18);tx(x+44,y+37,s,14,t['--text-1'],600);ic('arrow',x+170,y+24,15);});
  tx(72,1274,'为下一步，做好准备。',24,t['--text-1'],600);['简历工作台','岗位匹配','面试练习'].forEach((s,i)=>entry(72+i*440,1297,416,118,s,['梳理经历，写出你的优势。','了解要求，找到适合的方向。','把想法说清楚，从容面对机会。'][i],['resume','jobs','interview'][i]));
  tx(72,1515,'在同一条路上，让机会相遇。',24,t['--text-1'],600);tx(72,1549,'学生的成长，企业的发现，学校的支持。',14,t['--text-2']);btn(852,1515,136,'学生注册',true);btn(1000,1515,136,'企业入驻');btn(1148,1515,196,'学校工作台');ln(72,1640,1368,1640);brand(72,1657,40,23,false);tx(330,1689,'闻鸣知路，循引赴职。',14,t['--brand-text']);btn(1210,1658,158,'工作台入口');foot(h);await save(isDark?'02-portal-dark':'01-portal-light',w,h,'门户基本分区顺序保留，显著品牌与全幅多段背景。');}

async function mobile(){const w=390,h=2460;begin(w,h);bg(8,195,374,665,'campus');bg(8,880,374,490,'journey');bg(8,1390,374,290,'service');bg(8,1700,374,440,'paper');bg(8,2160,374,210,'pipeline');r(0,0,w,180,t['--surface'],'',0);brand(16,18,56,30,false);tx(88,119,'闻鸣知路，循引赴职。',15,t['--brand-text'],600);btn(330,25,44,'☾');btn(16,137,108,'岗位机会');btn(134,137,108,'就业服务');btn(252,137,122,'登录工作台',true);
  tx(24,238,'从校园出发 / CAREERPILOT',12,t['--brand-text'],600);tx(24,298,'让下一步，',38,t['--text-1'],600);tx(24,348,'更有方向。',38,t['--text-1'],600);tx(24,389,'连接未来，也看见当下可做的准备。',14,t['--text-1']);r(24,416,342,56,t['--surface'],t['--border-control'],12);ic('search',36,434);tx(66,451,'岗位、企业或专业',15,t['--text-2']);btn(284,422,76,'搜索',true);btn(24,492,190,'做好求职准备');campusImage(24,558,342,276);
  tx(24,930,'发现新的可能',23,t['--text-1'],600);btn(244,898,122,'查看全部');['前端开发工程师','数据分析助理','产品运营专员'].forEach((s,i)=>{const y=955+i*130;r(24,y,342,114,t['--surface'],t['--border']);tx(42,y+32,s,18,t['--text-1'],600);tx(42,y+58,'示例企业（虚构） · 本科',13,t['--text-2']);tx(42,y+91,`${9+i}–${13+i}K / 月`,18,t['--brand-text'],600);tx(268,y+91,'本站办理',12,t['--brand-text']);});
  tx(24,1437,'就业服务，触手可及。',22,t['--text-1'],600);tx(24,1465,'国家大学生就业服务平台',13,t['--text-2']);['专场招聘','实习岗位','就业指导','就业政策','求职风险提示'].forEach((s,i)=>btn(24+i%2*176,1486+Math.floor(i/2)*58,166,s));
  tx(24,1746,'为下一步，做好准备。',22,t['--text-1'],600);['简历工作台','岗位匹配','面试练习'].forEach((s,i)=>entry(24,1768+i*116,342,100,s,['梳理经历，写出你的优势。','了解要求，找到适合的方向。','把想法说清楚，从容面对机会。'][i],['resume','jobs','interview'][i]));
  tx(24,2204,'在同一条路上，让机会相遇。',21,t['--text-1'],600);btn(24,2232,166,'学生注册',true);btn(200,2232,166,'企业入驻');btn(24,2290,342,'学校工作台');ln(24,2390,366,2390);tx(24,2422,'路鸣职引 · CareerPilot',16,t['--brand-text'],600);tx(24,2447,'v1.0 静态全页排版样例 · 非运行截图',11,t['--text-2']);await save('03-portal-mobile',w,h,'390px完整分区排版；三条岗位仅为静态样例，不改变实际数据数量。');}

const menus={学生:['生涯概览','简历工作台','岗位匹配','模拟面试','我的投递','协议与去向','我的求职记录','站内服务','我的账号'],企业:['招聘概览','岗位管理','候选人流程','意向与协议','面试日程','站内服务','我的账号'],辅导员:['学生名册','去向审核','帮扶跟进','就业驾驶舱','站内服务','我的账号'],管理员:['管理控制台','账号审核','准入与岗位审核','机会来源管理','站内服务','我的账号']};
function shell(h,role,title,family){
  bg(236,80,1188,h-128,family);r(0,0,224,h,dark?'#16233a':'#edf2fc','',0);brand(12,20,44,24,false);tx(24,112,role+'工作空间',12,t['--text-2']);menus[role].forEach((s,i)=>{const y=137+i*49;if(s===title){r(12,y,200,42,t['--brand'],'',10);tx(50,y+27,s,14,'#fff',600);}else tx(50,y+27,s,14,t['--text-2']);ic(['home','resume','jobs','interview','timeline','agreement','destination','help','people'][i%9],22,y+12,18,s===title?'#fff':t['--text-2']);});
  r(240,0,1200,64,t['--surface'],'',0);tx(256,39,role+'工作空间  /  '+title,14,t['--text-2']);tx(980,39,'授权：已允许  ·  服务：不可用',13,t['--ai-text']);ic('sun',1252,23);tx(1290,39,'示例账号',13,t['--text-2']);tx(268,127,title,28,t['--text-1'],600);tx(268,157,'保留全部原有操作、状态、权限、数据及调用条件',14,t['--text-2']);
  r(18,h-160,188,92,t['--surface'],t['--border']);tx(32,h-126,'原有宠物与动作保留',14,t['--text-1'],600);tx(32,h-101,'不强改位置 / 漫游设置',12,t['--text-2']);
}
async function workspace(name,role,title,family,kind){const w=1440,h=1100;begin(w,h,kind==='interview');shell(h,role,title,family);
  if(kind==='home'){
    ['最近保存的本地完整度','投递进展','帮扶计划'].forEach((s,i)=>{panel(268+i*380,192,356,120,s);tx(292+i*380,274,['80 / 100','4 条','1 项'][i],30,t['--brand-text'],600);});panel(268,336,736,336,'下一步，从一件可完成的准备开始','展示既有待办，不构造新的评分和推荐逻辑');['完善简历经历','核对岗位要求','准备面试回答'].forEach((s,i)=>entry(292,425+i*74,688,62,s,'',['resume','jobs','interview'][i]));panel(1028,336,356,336,'当前帮扶计划','复查时间、说明与原有入口');tx(1052,452,'按计划补充材料',18,t['--text-1'],600);btn(1052,574,308,'查看原计划');panel(268,696,1116,294,'岗位建议','岗位事实、来源、规则依据与下一步');['前端开发工程师','数据分析助理'].forEach((s,i)=>entry(292+i*546,792,522,150,s,'样例内容 · 不是实际推荐结果','jobs'));
  }else if(kind==='interview'){
    panel(268,192,736,570,'当前问题','AI 问题与回答内容仅为合成排版样例');tx(292,310,'请说明一次解决复杂问题的经历。',25,t['--text-1'],600);r(292,354,688,258,t['--bg-base'],t['--border-control']);tx(316,392,'回答与转写在这里核对；保留 IME 输入。',16,t['--text-2']);tx(316,440,'仅真实录音电平驱动波形，不用背景装饰冒充。',14,t['--text-2']);btn(292,650,184,'确认并提交回答',true);btn(492,650,116,'暂停');btn(624,650,180,'结束并查看反馈');panel(1028,192,356,570,'会话与语音设置','文字 / 语音语义保持独立');['授权、连接、任务状态分离','自动播放 / 收音原条件不变','自然轮换与转写核对保留','来源与历史记录完整保留'].forEach((s,i)=>tx(1052,306+i*70,s,14,t['--text-2']));panel(268,786,1116,204,'历史与报告入口','滚动不自动提交，不重建任务，不产生额外生成');btn(292,898,160,'查看历史');btn(468,898,160,'报告与反馈');
  }else if(kind==='candidates'){
    panel(268,192,1116,98,'筛选与排序');tx(292,263,'关键词   /   岗位   /   候选阶段   /   排序',15,t['--text-2']);panel(268,314,360,676,'候选人列表','保留检索、当前选中与阶段');['示例候选人甲','示例候选人乙','示例候选人丙'].forEach((s,i)=>entry(286,410+i*100,324,82,s,'投递快照 · 合成样例','people'));panel(652,314,732,676,'候选人详情','岗位、阶段、简历快照、证据与历史');['基本信息与原授权简历','投递材料与依据','面试日程及结果','意向 / 协议 / 操作历史'].forEach((s,i)=>{r(676,420+i*101,684,80,t['--surface-2'],'',10);tx(696,453+i*101,s,16,t['--text-1'],600);tx(696,479+i*101,'原字段与可执行动作按真实状态显示',13,t['--text-2']);});btn(676,897,160,'安排面试',true);btn(852,897,160,'完整简历');btn(1028,897,160,'原阶段操作');
  }else if(kind==='governance'){
    panel(268,192,1116,136,'审核队列与原筛选','类型、状态、检索、分页、辖区与历史保持不变');btn(292,266,160,'学生辖区交接');btn(468,266,160,'企业准入');btn(644,266,160,'岗位审核');panel(268,352,1116,638,'待审核材料','实底证据区：背景网格不穿透表格、材料和附件');['示例企业资料','示例岗位资料','示例交接申请'].forEach((s,i)=>{const y=452+i*138;r(292,y,1068,114,t['--surface-2'],'',10);tx(312,y+34,s,18,t['--text-1'],600);tx(312,y+65,'提交信息 / 核验字段 / 修订状态 / 原始历史',14,t['--text-2']);btn(1092,y+32,244,'核对与处理',i===0);});
  }else if(kind==='auth'){
    panel(470,216,706,690,'登录工作台','正式账号与演示身份保持明确区别');brand(510,310,56,30,false);field(510,446,626,'账号','填写原账号');field(510,548,626,'密码','输入密码');btn(510,654,626,'登录',true,48);tx(510,746,'注册、邀请参数、会话错误与重定向规则不变。',14,t['--text-2']);
  }else{
    panel(268,192,1116,126,'检索与筛选','查询参数、分页、来源、资格及更新时间保持不变');field(292,272,652,'关键词','岗位、企业或专业');btn(968,262,160,'搜索',true);btn(1144,262,216,'重置原筛选');panel(268,342,1116,648,'岗位列表与详情衔接','外部机会不冒充本站投递；保留校外跳转提示');['前端开发工程师','数据分析助理','产品运营专员'].forEach((s,i)=>entry(292,440+i*156,1068,130,s,'示例岗位 / 来源、资格、更新时间 / 详情与原跳转','jobs'));
  }
  foot(h);await save(name,w,h,'页面族关键结构定稿候选，样例不代表实际业务数据或所有字段。');}

async function remix(source,name,family,isDark){const text=fs.readFileSync(path.join(prior,source+'.svg'),'utf8');const dimensions=[...text.matchAll(/<svg[^>]+width="(\d+)" height="(\d+)"/g)][0];const w=Number(dimensions[1]),h=Number(dimensions[2]);begin(w,h,isDark);out=[];bg(236,80,1188,h-104,family);const background=out.join('');let s=text.replace(/(<rect x="0" y="0"[^>]+\/>)/,`$1${background}`);out=[];r(12,12,200,70,t['--surface'],'',0);brand(16,20,44,24,false);const end=s.lastIndexOf('</svg>');s=s.slice(0,end)+out.join('\n')+'\n'+s.slice(end);s=s.replaceAll('静态布局首稿','v1.0 静态布局稿').replaceAll('静态设计，非运行截图','最终候选设计，非运行截图');if(!isDark)s=s.replaceAll('#5a6782','#42516c');fs.writeFileSync(path.join(dir,name+'.svg'),s);await sharp(Buffer.from(s)).png().toFile(path.join(dir,name+'.png'));artifacts.push({name,width:w,height:h,note:'沿用已确认完整布局与全部样例图表/字段；加入全区背景与强化品牌。'});}

async function overlays(){const w=1440,h=1260;begin(w,h);bg(20,20,1400,1200,'service');tx(48,70,'窗口不是遗漏项，而是同一套视觉系统。',30,t['--text-1'],600);tx(48,103,'确认 / 表单 / 详情 / AI / 导航 / 指引：按语义分层，不改关闭、焦点及业务条件。',14,t['--text-2']);
  r(48,145,650,480,t['--surface'],t['--border'],20,'filter="url(#lift)"');bg(48,145,650,106,'status');tx(72,191,'驳回本次材料',22,t['--text-1'],600);tx(72,224,'危险操作保留原原因与确认门槛',14,t['--danger-text']);btn(630,161,44,'×');field(72,293,602,'驳回原因','请填写可供学生核对的具体原因',154);tx(72,493,'此处沿用至少 5 字、最多 300 字的原规则。',13,t['--text-2']);ln(72,539,674,539);btn(376,557,116,'取消');btn(508,557,166,'确认驳回',true);
  r(738,145,654,480,t['--surface'],t['--border'],20,'filter="url(#lift)"');bg(738,145,654,106,'paper');tx(762,191,'表单 / 文书与预览',22,t['--text-1'],600);tx(762,224,'标题色带 + 实底正文 + 稳定操作区',14,t['--text-2']);field(762,293,606,'原字段与校验','字段、限制、默认值保持不变');r(762,377,606,146,t['--surface-2'],'',12);tx(784,414,'证据、文书、版本、分页与来源',18,t['--text-1'],600);tx(784,450,'长正文独立滚动，底部按钮不遮挡输入。',14,t['--text-2']);btn(1050,557,144,'取消');btn(1210,557,158,'原保存动作',true);
  r(48,655,420,530,t['--surface'],t['--border'],20);bg(48,655,420,100,'journey');tx(72,697,'移动导航与菜单',22,t['--text-1'],600);tx(72,730,'同源菜单，不新增路由权限',14,t['--text-2']);['生涯概览','简历工作台','岗位匹配','模拟面试'].forEach((s,i)=>btn(72,784+i*65,372,s,i===1));
  r(492,655,420,530,t['--surface'],t['--border'],20);bg(492,655,420,100,'service');tx(516,697,'帮助 / 消息 / 指引',22,t['--text-1'],600);tx(516,730,'分区色面 + 章节航线',14,t['--text-2']);['功能与隐私说明','消息来源与跳转','操作帮助与异常恢复'].forEach((s,i)=>entry(516,784+i*110,372,90,s,'保留完整关键提示','help'));
  r(936,655,456,530,t['--surface'],t['--border'],20);bg(936,655,456,100,'studio');tx(960,697,'助手 / AI 连接与授权',22,t['--text-1'],600);tx(960,730,'声场仅作背景，不冒充真实状态',14,t['--text-2']);r(960,784,408,166,t['--surface-2'],'',12);tx(984,823,'消息和来源保持实底可读',17,t['--text-1'],600);tx(984,860,'查看历史时不抢滚动。',14,t['--text-2']);tx(984,900,'不额外生成、不伪装已连接。',14,t['--text-2']);field(960,1008,408,'原输入区','保留停止、IME 与快捷键');
  foot(h,'W01–W43 依覆盖清单映射；原生系统窗口及站外页面有明确边界');await save('12-overlays-navigation-help',w,h,'六类窗口背景结构，非可操作原型；原生 confirm 不批量异步替换。');}

async function atlas(){const w=1440,h=1230;begin(w,h);tx(48,65,'同一品牌，九种场景语言。',32,t['--text-1'],600);tx(48,98,'背景遍及页面主体和纵向分区；不只装饰角落。可见变化来自面积、明度、层次与结构，而不是持续晃动。',14,t['--text-2']);const labels=['校园航线 / 门户、身份','生涯旅程 / 概览、流程','纸张层次 / 编辑、文书','专注声场 / 面试、AI','招聘管线 / 企业','数据坐标 / 驾驶舱','秩序网格 / 治理审核','服务航标 / 帮助、工单','状态地形 / 异常、空态'];Object.keys(palette).forEach((f,i)=>{const x=48+i%3*456,y=134+Math.floor(i/3)*308;bg(x,y,432,282,f);r(x+20,y+122,392,140,t['--surface'],t['--border'],12);tx(x+36,y+159,labels[i],19,t['--text-1'],600);tx(x+36,y+194,'背景是可见的，内容是清晰的。',14,t['--text-2']);tx(x+36,y+231,'色面 + 专属图形 + 实底内容层',13,t['--text-2']);});tx(48,1094,'导航：连续色面与选中轨迹   ·   窗口：色带标题与正文纸面   ·   提示：语义色块与图标，不仅靠颜色',15,t['--text-1'],600);tx(48,1138,'打印/文书导出：白纸回退；浏览器原生确认、原生选择列表及站外系统由其宿主控制，不能靠站内 CSS 换肤。',14,t['--text-2']);foot(h);await save('13-background-atlas',w,h,'九种协调背景家族及不可控制宿主边界。');}

async function states(){const w=1440,h=1030;begin(w,h);bg(20,20,1400,960,'journey');tx(48,72,'交互的精致，来自每一个状态。',30,t['--text-1'],600);panel(48,118,1344,176,'入口与按钮','default / hover / pressed / focus-visible / disabled / loading');['默认入口','悬停入口','按下反馈','键盘焦点','不可用','处理中…'].forEach((s,i)=>{btn(72+i*216,218,192,s,i===1);if(i===3)r(716,214,200,52,'none',t['--focus-ring'],13,'stroke-width="2"');});panel(48,318,652,316,'字段与选择器','标签可见、错误贴近、触点清晰；保留原生语义');field(72,432,604,'字段标签','已填写内容');field(72,530,604,'校验失败示例','原值保留');tx(72,607,'具体错误就近说明，不自动清空或覆盖输入。',14,t['--danger-text']);panel(724,318,668,316,'列表 / 表格 / 状态反馈','表头、行分隔、选中和键盘焦点不只依赖颜色');['加载时保留框架','无数据与筛选无结果区分','失败保留草稿与恢复入口','权限不足不呈现越权内容'].forEach((s,i)=>tx(748,430+i*47,s,15,t['--text-1'],i===0?600:400));panel(48,658,1344,282,'动态与滚动：只呈现，不驱动业务','持续动画默认不启用；可见的静态背景本身就必须达到设计目标');['按钮 120ms / 状态 200ms / 窗口 260ms / 首次渐入 240ms、≤8px','背景可选局部缓动 14–20s，提供暂停，离屏停止，减少动态模式为静态','正文默认可见；不劫持滚轮、不自动移动审核表格、不用假进度或假波形','AI、录音、草稿页面不因主题/窗口/响应式调整而重挂载，不改 RouterView key'].forEach((s,i)=>tx(72,773+i*39,s,15,t['--text-2']));foot(h);await save('14-components-motion-states',w,h,'完整组件状态与动态边界规格；不是运行态无障碍认证。');}

async function identity(){const w=1440,h=1100;begin(w,h);bg(20,20,1400,1028,'campus');r(48,48,1344,98,t['--surface'],'',20);brand(72,64);btn(1176,76,192,'返回公共门户');campusImage(72,180,644,602);tx(72,844,'让每一步准备，都有方向。',32,t['--text-1'],600);tx(72,885,'身份页使用同一品牌，不把登录表单改成工作台布局。',15,t['--text-2']);panel(764,180,604,730,'登录工作台','正式登录 / 注册 / 邀请页沿用各自原字段和校验');field(796,325,540,'账号','输入原账号');field(796,425,540,'密码','输入密码');btn(796,525,540,'登录',true,48);tx(796,628,'学生注册 / 企业入驻 / 邀请绑定',16,t['--brand-text'],600);tx(796,676,'错误提示、会话过期、返回及重定向不变。',14,t['--text-2']);r(796,727,540,136,t['--surface-2'],'',12);tx(816,763,'离线分支：四角色演示身份',17,t['--text-1'],600);tx(816,798,'仍用原单选、原进入按钮及“演示”说明。',14,t['--text-2']);tx(816,831,'不呈现为真实账号登录。',14,t['--text-2']);foot(h);await save('15-identity-entry',w,h,'身份页面族：独立门户头、校园背景和实底表单，非后台外壳。');}

async function details(){const w=1440,h=1100;begin(w,h);bg(20,20,1400,1030,'paper');tx(48,75,'详情、报告、协议与服务：内容完整，背景有层次。',30,t['--text-1'],600);panel(48,120,852,838,'详情 / 报告 / 历史文书','返回与来源 → 任务标题 → 证据 / 正文 → 历史版本 → 原操作');['岗位详情：要求、资格、来源、时间及校外跳转','AI 报告：逐轮反馈、原始来源与历史生成标识','协议与去向：真实条款、附件、版本与办理历史'].forEach((s,i)=>{r(72,242+i*178,804,150,t['--surface-2'],'',12);tx(94,284+i*178,s,18,t['--text-1'],600);tx(94,324+i*178,'长内容自然增长；不隐藏信息换取卡片整齐。',14,t['--text-2']);tx(94,357+i*178,'文书预览保留白纸，装饰只在外部框架。',14,t['--text-2']);});btn(72,858,180,'原主要操作',true);btn(268,858,180,'原次要操作');panel(924,120,468,838,'工单 / 空态 / 错误 / 权限','每个状态保留安全可恢复的下一步');bg(948,223,420,184,'service');tx(972,274,'搜索 / 状态 / 分页 / 原角色动作',18,t['--text-1'],600);tx(972,318,'回复、结案、重开与历史不改变。',14,t['--text-2']);bg(948,433,420,184,'status');tx(972,484,'空数据 ≠ 搜索无结果 ≠ 失败',18,t['--text-1'],600);tx(972,528,'状态文字与图标明确，不杜撰业务数据。',14,t['--text-2']);r(948,643,420,267,t['--surface-2'],'',12);tx(972,688,'404 / 无权限 / 审核状态',18,t['--text-1'],600);tx(972,731,'原因、原返回入口、刷新及退出保留。',14,t['--text-2']);tx(972,774,'不因设计展示越权内容。',14,t['--text-2']);btn(972,824,372,'原安全返回入口');foot(h);await save('16-details-reports-service-status',w,h,'补充详情、报告、文书、工单及异常场景结构，不是完整字段枚举。');}

async function discovery(){const w=1440,h=1100;begin(w,h);bg(20,132,1400,916,'campus');r(0,0,w,112,t['--surface'],'',0);brand(56,24);btn(960,35,180,'返回公共门户');btn(1176,35,208,'登录工作台',true);tx(72,190,'岗位机会',30,t['--text-1'],600);tx(72,223,'来源、资格、更新时间与校外跳转提示完整保留',14,t['--text-2']);panel(72,251,1296,146,'搜索与原有筛选');field(96,328,720,'关键词','岗位、企业或专业');btn(840,316,176,'搜索',true);btn(1032,316,312,'原筛选与重置');['前端开发工程师','数据分析助理','产品运营专员'].forEach((s,i)=>entry(72,421+i*180,1296,156,s,'合成排版样例 / 来源与资格 / 更新时间 / 原详情入口','jobs'));btn(1072,988,128,'上一页');btn(1216,988,152,'下一页');foot(h);await save('11-opportunity-discovery',w,h,'公共岗位列表沿用公共头，不引入登录工作台菜单；学生列表使用同一内容模式。');}

await portal();await portal(true);await mobile();
await workspace('04-student-home','学生','生涯概览','journey','home');
await remix('03-resume-desktop','05-resume-editor','paper',false);
await workspace('06-interview-studio','学生','模拟面试','studio','interview');
await workspace('07-company-candidates','企业','候选人流程','pipeline','candidates');
await remix('02-dashboard-light','08-dashboard-light','analytics',false);
await remix('01-dashboard-dark','09-dashboard-dark','analytics',true);
await workspace('10-governance','管理员','准入与岗位审核','governance','governance');
await discovery();
await overlays();await atlas();await states();await identity();await details();

// Every inventory row gets an explicit family, layout and review/verification owner.
const original=fs.readFileSync(path.join(prior,'surface-inventory.md'),'utf8');
const pages=[];const windows=[];
for(const line of original.split('\n')){
  const m=line.match(/^\|\s*((?:P|S|C|T|A|X|H)\d+\w*|W\d+)\s*\|/);if(!m)continue;
  const cells=line.split('|').slice(1,-1).map(x=>x.trim());const item={id:cells[0],context:cells[1],surface:cells[2],preserve:cells[3]};(m[1].startsWith('W')?windows:pages).push(item);
}
const groups={
  campus:['P01','P02','P03','P04','P05','P06','P07','P08','P09'],journey:['S01','S07','S08','S09','S18','S19'],
  paper:['S02','S03','S04','S05','S06','S15','S16','S17'],studio:['S10','S11','S12','S13','S14'],
  pipeline:['C01','C02','C03','C04','C05'],analytics:['T03'],governance:['P10','T01','T02','T04','A01','A02','A03','A04'],
  service:['P13','X01a','X01b','X01c','X01d','X02a','X02b','X02c','X02d'],status:['P11','P12','H01'],
};
const reference={campus:'01-portal-light',journey:'04-student-home',paper:'05-resume-editor',studio:'06-interview-studio',pipeline:'07-company-candidates',analytics:'08-dashboard-light',governance:'10-governance',service:'12-overlays-navigation-help',status:'13-background-atlas'};
const layouts={P03:'筛选→来源明确的列表→分页',P04:'岗位标题→事实/资格→来源/时间→原外跳与准备衔接',P05:'独立身份页：品牌校园分区→实底登录表单',P06:'独立演示身份页：四角色原选项→演示说明→进入',P07:'独立身份页：学生注册字段→校验→原申请',P08:'独立身份页：企业注册字段→校验→原申请',P09:'独立身份页：邀请说明→绑定参数→有效/失效状态',P10:'账号状态→原原因→刷新/改密/退出',S02:'标题工具栏→六段编辑→体检/建议',S03:'标题工具栏→editor/suggestions→证据与逐条采纳',S04:'外发说明→对照与采纳→草稿/版本工具',S05:'整文件外发警告→上传/限制→页级识别结果',S06:'真实保存版本→白纸预览→原导出/打印',S18:'筛选列表→原详情→日程/意向→历史时间轴',S19:'去向表单→附件→确认/驳回/通过→历史',T01:'检索名册→学生详情→材料证据→历史',T02:'待审队列→实底证据→原审核操作',T04:'计划列表→创建/复查/结案/重开→原原因确认',A04:'同步/候选→发布差异→核实字段→来源与历史'};
for(const p of pages){p.family=Object.entries(groups).find(([,ids])=>ids.includes(p.id))?.[0];if(!p.family)throw Error('Unmapped page '+p.id);p.layout=layouts[p.id]||({campus:'品牌/任务标题→原内容分区→来源/原入口',journey:'任务标题→检索/进展→列表/详情→原动作',paper:'任务标题/工具→实底编辑或白纸文书→证据/历史',studio:'准备/当前任务→问题/输入→真实状态→历史/报告',pipeline:'招聘标题→检索/管线→列表/详情→原状态动作',analytics:'四 KPI→两列宽图→全宽热图→两种问数',governance:'标题/审核队列→检索→实底表格/证据→历史与原命令',service:'任务标题→搜索/状态→列表/详情→原角色动作',status:'状态图形→原因→原安全返回入口'}[p.family]);p.reference=(['P05','P06','P07','P08','P09'].includes(p.id)?'15-identity-entry':['P04','P10','P11','P12','S06','S15','S16','S17','S19','X01a','X01b','X01c','X01d'].includes(p.id)?'16-details-reports-service-status':p.id==='P03'?'11-opportunity-discovery':reference[p.family])+'.png';p.designStatus=p.id==='H01'?'历史未激活，不新增路由':'页面族结构与背景已指定，运行截图待实施';p.executionStatus='未实施';p.validationStatus='待执行';}
for(const a of windows){a.family=['W06','W07','W08','W12'].includes(a.id)?'studio':['W10','W11','W36','W37','W38'].includes(a.id)?'paper':['W01','W09'].includes(a.id)?'journey':['W02','W04','W05','W34','W35','W43'].includes(a.id)?'service':'governance';a.layout=['W01','W02','W04','W05','W08','W12'].includes(a.id)?'抽屉：场景标题色带→实底分区→原工具/关闭':'窗口：语义标题色带→原字段/证据→稳定原操作区';a.reference='12-overlays-navigation-help.png';a.exception=['W39','W40','W41','W42'].includes(a.id)?'浏览器原生 confirm 不可 CSS 换肤；保留同步行为，定制替换单列后续批准门槛':'无应用窗口视觉豁免；嵌入 PDF/原生选择面板按宿主限制';a.executionStatus='未实施';a.validationStatus='待执行';}
const coverage={revision:'1.0-final-candidate',generatedAt:new Date().toISOString(),scope:'设计映射不是实施完成率；所有分支仍须运行遍历，发现即追加',pageCount:pages.length,windowGroupCount:windows.length,pages,windows};
fs.writeFileSync(path.join(dir,'coverage-matrix.json'),JSON.stringify(coverage,null,2)+'\n');
const md=['# 全站设计映射与施工验收台账','',`页面/分区 ${pages.length} 项（含历史 H01），窗口组 ${windows.length} 项。以下是设计分配，不是逐状态高保真截图或实施完成声明。`,'','| ID | 场景 | 背景家族 | 结构与不可删内容 | 执行/验证 |','|---|---|---|---|---|',...pages.map(p=>`| ${p.id} | ${p.context} ${p.surface} | ${p.family} | ${p.layout}；${p.preserve} | 未实施 / 待执行 |`),'','## 窗口、展开和提示','', '| ID | 窗口 | 背景/结构 | 保持及边界 | 执行/验证 |','|---|---|---|---|---|',...windows.map(a=>`| ${a.id} | ${a.context} ${a.surface} | ${a.family}；${a.layout} | ${a.preserve}；${a.exception} | 未实施 / 待执行 |`)];
fs.writeFileSync(path.join(dir,'coverage-matrix.md'),md.join('\n')+'\n');
const luminance=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
const contrast=[];for(const mode of ['light','dark'])for(const [fg,bg] of [['--text-1','--surface'],['--text-2','--surface'],['--brand-text','--surface'],['--on-brand','--brand'],['--danger-text','--danger-soft'],['--ai-text','--ai-soft']]){const a=luminance(themes[mode][fg]),b=luminance(themes[mode][bg]);contrast.push({mode,fg,bg,ratio:+((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(3)});}
for(const mode of ['light','dark'])for(const [family,colors] of Object.entries(palette))for(const color of mode==='dark'?['#24395c','#194449']:colors)for(const fg of ['--text-1','--text-2','--brand-text']){const a=luminance(themes[mode][fg]),b=luminance(color);contrast.push({mode,family,fg,bg:color,ratio:+((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(3)});}
// Background labels needing opaque support are explicitly diagnosed, never silently passed.
const report={generatedAt:new Date().toISOString(),revision:'1.0-final-candidate',kind:'static artifact verification, NOT application tests',artifacts,coverage:{pages:pages.length,windowGroups:windows.length,unmapped:0},contrast,contrastWarnings:contrast.filter(x=>x.ratio<4.5),limits:[`${artifacts.length} representative composed screens, not pixel-perfect drawings of every runtime state`,'coverage is specification mapping, not implementation/functional completeness','Text-on-gradient runtime contrast, focus, browser layout and real devices require execution verification','Figma Make outcome unverified; native Design library not created','No model calls, database, credential, external asset downloads or app source writes']};
fs.writeFileSync(path.join(dir,'design-tokens.final-candidate.json'),JSON.stringify({revision:'1.0-final-candidate',status:'Design only; not imported by app',themes,palette,brand:{portal:{mark:64,wordmark:36,weight:700,english:14,slogan:17,headerMin:112},mobile:{mark:56,wordmark:30,english:14,slogan:15,headerMin:184},workspace:{mark:44,wordmark:24,english:13}},background:{contentSurfaceOpacity:1,decorationPointerEvents:'none',ariaHidden:true,continuousMotionDefault:false,mutedTextLight:'#42516c',print:'remove decoration; white document'},motion:{feedback:120,state:200,panel:260,reveal:240,maxTranslation:8}},null,2)+'\n');
fs.writeFileSync(path.join(dir,'design-validation.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(dir,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>路鸣职引 · 最终设计候选 v1.0</title><style>body{margin:0;background:#e1e9f7;color:#16233a;font:16px/1.7 'Microsoft YaHei',sans-serif}header,main{max-width:1440px;margin:auto;padding:24px}figure{margin:32px 0;background:white;border-radius:20px;padding:18px}img{width:100%;height:auto}a{color:#23409b}figcaption{font-size:20px;font-weight:600}small{color:#5a6782}</style><header><h1>路鸣职引 · 灯塔·多场景全站界面</h1><p>v1.0 最终设计候选 / 待批准执行 / 非应用运行截图</p><p>原功能、权限、数据、AI 调用契约不变。全站设计范围见 <a href="coverage-matrix.md">逐项台账</a>，执行前阅读 <a href="README.md">交付说明</a>。</p></header><main>${artifacts.map(a=>`<figure><figcaption>${esc(a.name)}</figcaption><p>${esc(a.note)}</p><a href="${a.name}.svg">可编辑 SVG</a><br><img loading="lazy" src="${a.name}.png" alt="${esc(a.name)}"><small>静态设计，合成样例，非运行截图。</small></figure>`).join('')}</main></html>`);
console.log(JSON.stringify({artifacts:artifacts.length,pages:pages.length,windowGroups:windows.length,contrastWarnings:report.contrastWarnings.length,output:dir},null,2));
