// Local design-artifact renderer. Never imports application code, opens a DB,
// starts a service, or makes a network/AI request. SVGs remain editable.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../../..');
const v02 = process.argv.includes('--v02');
const outputDir = v02 ? path.join(dir, 'v02') : dir;
if (v02) fs.mkdirSync(outputDir, { recursive: true });
const tokens = JSON.parse(fs.readFileSync(path.join(dir, 'design-tokens.proposed.json'), 'utf8'));
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const photo = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(root, 'public/media/campus-ai.jpg')).toString('base64');
const pet = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'public/vendor/dsh-pet/poster.png')).toString('base64');
const iconSource = fs.readFileSync(path.join(root, 'src/components/base/AppIcon.vue'), 'utf8');
const paths = Object.fromEntries([...iconSource.matchAll(/(\w+):\s*"([^"]+)"/g)].map(m => [m[1], m[2]]));
let t, out;
const reports = [];
function begin(width, height, dark = false) {
  t = tokens.themes[dark ? 'dark' : 'light'];
  out = [`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<title>路鸣职引 UI 设计首稿 · 静态设计，非运行截图</title>`,
    `<defs><filter id="shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#16233a" flood-opacity=".1"/></filter></defs>`,
    `<style>text{font-family:'Microsoft YaHei','Noto Sans SC',sans-serif} .num{font-family:'Consolas','Microsoft YaHei',monospace;font-variant-numeric:tabular-nums}</style>`];
  rect(0, 0, width, height, t['--bg-base']);
}
function rect(x, y, w, h, fill = t['--surface'], stroke, radius = 0, extra = '') {
  out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}"${stroke ? ` stroke="${stroke}"` : ''} ${extra}/>`);
}
function text(x, y, value, size = 14, color = t['--text-1'], weight = 400, extra = '') {
  out.push(`<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${color}" ${extra}>${xml(value)}</text>`);
}
function lines(x, y, values, size = 14, color = t['--text-2'], leading = 22, weight = 400) {
  values.forEach((v, i) => text(x, y + i * leading, v, size, color, weight));
}
function line(x1, y1, x2, y2, color = t['--border'], width = 1, extra = '') {
  out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${extra}/>`);
}
function circle(x, y, r, fill, extra = '') { out.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`); }
function icon(name, x, y, size = 20, color = t['--text-2']) {
  out.push(`<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name] || paths.arrow}"/></svg>`);
}
function image(x, y, w, h, source) {
  out.push(`<image x="${x}" y="${y}" width="${w}" height="${h}" href="${source}" preserveAspectRatio="xMidYMid meet"/>`);
}
function brand(x, y, compact = false) {
  out.push(`<svg x="${x}" y="${y}" width="36" height="36" viewBox="0 0 40 40" fill="none" stroke="${t['--brand-text']}" stroke-linecap="round"><circle cx="20" cy="20" r="19" opacity=".2"/><path d="M8 31 C13 27 13 22 18 19 S27 13 31 9" stroke-dasharray="2.5 3" stroke-width="1.5"/><path d="M10 15 Q13 11 16 15 M12 19 Q16 14 20 19" stroke-width="1.3"/><circle cx="31" cy="9" r="2.6" fill="${t['--ai']}" stroke="none"/></svg>`);
  text(x + 46, y + 17, '路鸣职引', compact ? 18 : 20, undefined, 600);
  text(x + 46, y + 34, 'CareerPilot', 12, t['--text-2']);
}
function button(x, y, w, label, variant = 'secondary', h = 44, ic) {
  const disabled = variant === 'disabled';
  const fill = variant === 'primary' ? t['--brand'] : variant === 'danger' ? t['--danger-soft'] : disabled ? t['--disabled-bg'] : t['--surface'];
  const fg = variant === 'primary' ? t['--on-brand'] : variant === 'danger' ? t['--danger-text'] : disabled ? t['--disabled-fg'] : t['--text-1'];
  const border = variant === 'primary' ? undefined : variant === 'danger' ? t['--danger-text'] : disabled ? t['--border'] : t['--border-control'];
  rect(x, y, w, h, fill, border, 10);
  if (ic) icon(ic, x + 14, y + (h - 18) / 2, 18, fg);
  text(x + w / 2 + (ic ? 10 : 0), y + h / 2 + 5, label, h <= 36 ? 13 : 14, fg, 600, 'text-anchor="middle"');
}
function badge(x, y, label, kind = 'brand', w = label.length * 13 + 24) {
  const bg = kind === 'warn' ? t['--warn-soft'] : kind === 'ai' ? t['--ai-soft'] : kind === 'success' ? t['--success-soft'] : t['--brand-soft'];
  const fg = kind === 'warn' ? t['--warn-text'] : kind === 'ai' ? t['--ai-text'] : kind === 'success' ? t['--success-text'] : t['--brand-text'];
  rect(x, y, w, 28, bg, undefined, 7); text(x + 12, y + 19, label, 12, fg, 400);
}
function field(x, y, w, label, value, {height = 44, multiline = false} = {}) {
  text(x, y, label, 14, t['--text-1'], 600);
  rect(x, y + 12, w, height, t['--surface'], t['--border-control'], 10);
  if (Array.isArray(value)) lines(x + 14, y + 40, value, 14, t['--text-1'], 23);
  else text(x + 14, y + 40, value, multiline ? 14 : 16);
}
function panel(x, y, w, h, title, note) {
  rect(x, y, w, h, t['--surface'], t['--border'], 14);
  text(x + 24, y + 35, title, 18, undefined, 600);
  if (note) text(x + 24, y + 59, note, 13, t['--text-2']);
}
function shell(height, role, active) {
  rect(0, 0, 224, height, t['--surface']); line(224, 0, 224, height);
  brand(24, 24);
  text(24, 118, role + '工作空间', 12, t['--text-2']);
  const menus = role === '学生' ? [['home','生涯概览'],['resume','简历工作台'],['jobs','岗位匹配'],['interview','模拟面试'],['timeline','我的投递'],['agreement','协议与去向'],['destination','我的求职记录'],['help','站内服务'],['people','我的账号']]
    : [['people','学生名册'],['agreement','去向审核'],['timeline','帮扶跟进'],['chart','就业驾驶舱'],['help','站内服务'],['people','我的账号']];
  menus.forEach(([ic, label], i) => {
    const yy = 140 + i * 50, selected = active === label;
    if (selected) rect(12, yy, 200, 44, t['--brand-soft'], undefined, 10);
    icon(ic, 28, yy + 12, 20, selected ? t['--brand-text'] : t['--text-2']);
    text(60, yy + 28, label, 14, selected ? t['--brand-text'] : t['--text-2'], selected ? 600 : 400);
    if (selected) circle(196, yy + 22, 2.5, t['--brand-text']);
  });
  const dockY = height - 268;
  rect(16, dockY, 192, 180, t['--surface-2'], t['--border'], 14);
  image(54, dockY + 4, 116, 122, pet);
  text(112, dockY + 145, 'AI Chatbot  ·  ···', 13, t['--text-1'], 600, 'text-anchor="middle"');
  text(112, dockY + 166, '停靠示意 · 原拖动/动作均保留', 11, t['--text-2'], 400, 'text-anchor="middle"');
  icon('help', 26, height - 58, 18); text(54, height - 43, '帮助与说明', 13, t['--text-2']);
  rect(225, 0, 1215, 64, t['--surface']); line(224, 64, 1440, 64);
  text(256, 39, role + '工作空间', 13, t['--text-2']);
  icon('chevron', 355, 25, 14); text(380, 39, active, 13, t['--text-1'], 600);
  text(755, 39, '消息', 13, t['--text-2']);
  badge(809, 19, '授权：已允许', 'ai', 114);
  badge(935, 19, '服务：不可用', 'warn', 114);
  icon('sun', 1078, 23, 20); icon('people', 1126, 23, 20);
  text(1160, 39, role + '示例账号', 13, t['--text-2']); icon('logout', 1310, 23, 18); text(1336, 39, '退出', 13, t['--text-2']);
}
function artifactFooter(height, label) {
  text(256, height - 16, label + ' · 静态布局首稿 / 全部数据为虚构排版样例 / 非运行截图', 12, t['--text-2']);
}
async function save(name, width, height, note) {
  out.push('</svg>'); const svg = out.join('\n');
  fs.writeFileSync(path.join(outputDir, name + '.svg'), svg);
  await sharp(Buffer.from(svg)).png().toFile(path.join(outputDir, name + '.png'));
  const metadata = await sharp(path.join(outputDir, name + '.png')).metadata();
  reports.push({name, width:metadata.width, height:metadata.height, note});
}

async function dashboard(dark) {
  const width = 1440, height = 1540;
  begin(width, height, dark); shell(height, '辅导员', '就业驾驶舱');
  text(256, 109, '2027 届  /  当前辅导员辖区  /  统计时点 2026-11-16', 13, t['--text-2']);
  text(256, 153, '就业质量驾驶舱', 28, undefined, 600);
  text(256, 181, '从整体趋势，到需要被看见的一个人。', 14, t['--text-2']);
  button(1240, 125, 168, '导出当前视图', 'secondary', 44, 'upload');
  const metrics = [['去向落实率','75.0%','已审核有效去向 / 辖区学生'],['辖区学生','40','仅当前账号可见范围'],['固定规则预警','3','按现有规则识别，非AI判断'],['平均投递','4.2','当前范围投递数 / 学生数']];
  metrics.forEach(([label, value, note], i) => {
    const x=256+i*294; rect(x,208,270,98,t['--surface'],t['--border'],14);
    text(x+20,234,label,13,t['--text-2']); text(x+20,272,value,30,undefined,600,'class="num"'); text(x+20,292,note,12,t['--text-2']);
  });
  panel(256,326,564,332,'去向结构','按当前有效去向分类 · 单位：人');
  const colors=['#91a9ff','#46c7ba','#b7a4ff','#f4c66a','#9cbcff',t['--text-3']];
  const vals=[24,4,1,1,4,6], labels=['签约就业','升学','自主创业','灵活就业','待审核','未登记'];
  const cx=406,cy=485,r=80,per=2*Math.PI*r;let offset=0;
  circle(cx,cy,r,t['--surface'],'stroke="'+t['--surface-2']+'" stroke-width="26"');
  vals.forEach((n,i)=>{out.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colors[i]}" stroke-width="26" stroke-dasharray="${n/40*per} ${per}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})"/>`);offset+=n/40*per;});
  text(cx,482,'40',32,undefined,600,'text-anchor="middle" class="num"');text(cx,509,'辖区学生',13,t['--text-2'],400,'text-anchor="middle"');
  labels.forEach((s,i)=>{rect(548,416+i*32,10,10,colors[i],undefined,3);text(570,426+i*32,s,13,t['--text-1']);text(784,426+i*32,vals[i],14,t['--text-1'],600,'text-anchor="end" class="num"');});
  text(280,632,'已落实 30 人 · 待审核 4 人 · 未登记 6 人',13,t['--text-2']);
  panel(844,326,564,332,'投递转化','沿用现有去重口径 · 单位：次');
  const stages=[['投递',168],['进入面试',54],['获得录用',31],['签署协议',24]];
  stages.forEach(([label,n],i)=>{
    const y=407+i*49, top=n/168*340, bottom=(stages[i+1]?.[1]??0)/168*340, center=1042;
    out.push(`<path d="M${center-top/2} ${y} L${center+top/2} ${y} L${center+bottom/2} ${y+45} L${center-bottom/2} ${y+45} Z" fill="${colors[i]}" stroke="${t['--brand-text']}" stroke-width="1"/>`);
    const edge=center+(top+bottom)/4;
    line(edge,y+22,1221,y+22,t['--text-3']);
    text(1230,y+27,label,13,t['--text-1']);text(1382,y+27,n,14,t['--text-1'],600,'text-anchor="end" class="num"');
  });
  text(868,632,'投递 168 · 面试 54 · 录用 31 · 协议 24',13,t['--text-2']);
  panel(256,678,564,300,'八周趋势','按周末审计快照重放；缺失快照不补零');
  [0,25,50,75,100].forEach((n,i)=>{const y=903-i*34;line(322,y,786,y,t['--border']);text(306,y+5,n+'%',12,t['--text-2'],400,'text-anchor="end"');});
  out.push(`<path d="M326 882 L391 864 L456 853 L521 833 L586 817 L651 809 L716 801 L781 801" fill="none" stroke="${t['--brand-text']}" stroke-width="3" stroke-linejoin="round"/>`);
  [[326,882],[391,864],[456,853],[521,833],[586,817],[651,809],[716,801],[781,801]].forEach(([x,y])=>circle(x,y,3,t['--brand-text']));
  ['09/27','10/11','10/25','11/08'].forEach((v,i)=>text(326+i*140,930,v,12,t['--text-2']));
  panel(844,678,564,300,'慢就业预警','固定规则 · 展示触发依据及原有后续操作');
  ['示例学生甲','示例学生乙','示例学生丙'].forEach((v,i)=>{const y=759+i*66;if(i)line(868,y-14,1384,y-14);circle(883,y+8,15,t['--warn-soft']);text(883,y+13,['甲','乙','丙'][i],13,t['--warn-text'],600,'text-anchor="middle"');text(910,y+5,v,14,undefined,600);text(910,y+26,'触发条件与说明沿用真实规则',12,t['--text-2']);button(1138,y-4,118,'生成帮扶建议','secondary',36);button(1264,y-4,120,'记录闭环','secondary',36);});
  panel(256,998,1152,270,'专业 × 行业流向','仅统计已审核签约就业去向 · 数字为人数，零值与缺失分别处理');
  const cols=['数字技术','专业服务','制造业','公共服务','教育','其他'],rows=['软件工程','数据科学','市场营销','工商管理'];
  cols.forEach((v,i)=>text(498+i*145,1089,v,13,t['--text-2'],400,'text-anchor="middle"'));
  const flow=[[3,2,1,0,0,0],[2,1,1,1,1,0],[1,1,1,1,1,1],[2,1,1,1,1,0]];
  rows.forEach((v,i)=>{text(394,1125+i*34,v,13,t['--text-2'],400,'text-anchor="end"');cols.forEach((_,j)=>{const n=flow[i][j];rect(429+j*145,1103+i*34,138,28,n===0?t['--surface-2']:n===1?t['--brand-soft']:n===2?'#91a9ff':'#2f55c8',undefined,4);text(498+j*145,1122+i*34,n,13,n===3?'#ffffff':n===2?'#16233a':t['--text-1'],600,'text-anchor="middle"');});});
  text(280,1250,'配色与数值仅示意，正式图表仍使用原始聚合与原有缺失规则。',12,t['--text-2']);
  panel(256,1287,1152,200,'自然语言问数','本地聚合负责数值，模型只负责解释；两个入口保持独立');
  field(280,1380,700,'问一个就业数据问题','当前去向落实率是多少？');
  button(996,1392,116,'本地问数','primary');button(1124,1392,260,'生成问数解读','secondary');
  text(280,1466,'AI授权已允许不等于服务可用；滚动、筛选与图表动画不触发模型生成。',13,t['--text-2']);
  artifactFooter(height,'D01 · 宽图优先 / 所有原有面板与动作保留 / 宠物停靠待评审');
  await save(dark?'01-dashboard-dark':'02-dashboard-light',width,height,'Desktop chart layout and theme review. Synthetic values, not rendered product.');
}

async function resumeDesktop() {
  const width=1440,height=1280;
  begin(width,height);shell(height,'学生','简历工作台');
  text(256,110,'简历工作台',28,undefined,600);badge(436,85,'草稿未保存','warn',116);
  text(256,141,'把经历写清楚。预览、导出与体检使用最近保存版本。',14,t['--text-2']);
  button(1092,90,136,'版本对比');button(1240,90,168,'保存新版本','primary',44,'check');
  const tools=[['预览与导出简历',166],['AI优化 / 润色',150],['识别PDF / 图片文字',196],['打印简历',120]];
  let xx=256;tools.forEach(([label,w])=>{button(xx,169,w,label,'secondary',36);xx+=w+12;});
  text(256,230,'编辑内容优先 · 字段、段落、附件、版本、建议与原有校验完整保留',13,t['--text-2']);
  rect(256,250,152,368,t['--surface'],t['--border'],14);
  ['基本信息','教育背景','实习经历','项目经历','技能','证书'].forEach((v,i)=>{const y=269+i*45;if(i===0)rect(266,y-3,132,36,t['--brand-soft'],undefined,8);text(284,y+20,v,14,i===0?t['--brand-text']:t['--text-2'],i===0?600:400);});
  line(272,552,392,552);text(280,578,'版本 3',13,t['--text-2']);text(280,602,'草稿未保存',13,t['--warn-text']);
  panel(428,250,648,220,'基本信息');
  field(452,326,288,'姓名','林同学（虚构）');field(764,326,288,'联系邮箱','student@example.test');
  field(452,408,288,'专业','软件工程');field(764,408,288,'学历','本科');
  panel(428,490,648,350,'教育背景');button(884,510,168,'添加教育经历','secondary',36);
  field(452,575,288,'教育专业','软件工程');field(764,575,288,'教育学历','本科');
  field(452,654,600,'学校','示例大学（虚构）');
  field(452,733,288,'入学日期','2023-09-01');field(764,733,288,'毕业日期','2027-06-30');
  text(452,820,'移除此教育经历',13,t['--text-2']);
  panel(428,860,648,348,'实习经历');button(906,880,146,'添加经历','secondary',36);
  field(452,937,288,'机构名称','示例机构（虚构）');field(764,937,288,'承担角色','前端开发实习生');
  field(452,1009,288,'开始日期','2026-07-01');field(764,1009,288,'结束日期','2026-09-01');
  field(452,1081,600,'实习描述 1',['参与业务组件维护、表单交互与测试。','只填写真实参与内容，不虚构技能或成果。'],{height:76,multiline:true});
  text(452,1190,'移除此经历',13,t['--text-2']);
  panel(1096,250,312,394,'简历体检','最近保存版本 · 本地完整度');
  circle(1165,379,39,t['--surface'],'stroke="'+t['--surface-2']+'" stroke-width="7"');
  circle(1165,379,39,'none','stroke="'+t['--brand']+'" stroke-width="7" stroke-dasharray="202.2 245" transform="rotate(-90 1165 379)"');
  text(1165,386,'82.5',22,undefined,600,'text-anchor="middle" class="num"');
  text(1221,370,'六项完整度',14,undefined,600);text(1221,396,'不是录用评价',13,t['--text-2']);
  const dimensions=[['基本信息',100],['教育背景',75],['实习经历',75],['项目经历',100],['技能',100],['证书',25]];
  dimensions.forEach(([v,n],i)=>{text(1120,454+i*30,v,13,t['--text-2']);rect(1200,444+i*30,132,6,t['--surface-2'],undefined,3);rect(1200,444+i*30,132*n/100,6,t['--brand'],undefined,3);text(1384,454+i*30,n,12,t['--text-2'],400,'text-anchor="end" class="num"');});
  panel(1096,664,312,476,'表达建议','仅主动生成时调用AI');
  field(1120,753,264,'参考岗位（可选）','不关联岗位');field(1120,837,264,'改写策略','梳理结构，不增加事实');
  rect(1120,914,18,18,t['--surface'],t['--border-control'],4);text(1147,929,'保留我的原有语气',14);
  button(1120,956,264,'生成表达建议','disabled');
  lines(1120,1032,['请先保存草稿。当前服务不可用。','点击生成将必要描述脱敏外发，','可能产生费用，可在顶部关闭AI。'],13,t['--text-2'],22);
  text(1120,1116,'原文、证据与逐条采纳规则保留。',12,t['--text-2']);
  text(428,1234,'视口节选：下方继续项目经历、技能、证书；辅助诊断不占据手机编辑首屏。',13,t['--text-2']);
  artifactFooter(height,'D02 · 编辑优先 / 顶部工具全保留 / 体检不伪装为AI评分');
  await save('03-resume-desktop',width,height,'Initial desktop viewport; remaining sections explicitly retained in specification.');
}

async function resumeMobile() {
  const width=430,height=1470;begin(width,height);
  text(20,30,'D03 · 390px 手机布局 · 编辑优先',16,undefined,600);
  out.push('<g transform="translate(20 54)">');
  rect(0,0,390,1320,t['--bg-base'],t['--border'],20);
  rect(0,0,390,64,t['--surface'],undefined,20);brand(16,14,true);icon('menu',338,23,24);
  line(0,64,390,64);badge(16,78,'授权：已允许','ai',114);badge(142,78,'服务：不可用','warn',114);
  text(16,149,'简历工作台',24,undefined,600);text(16,176,'草稿未保存 · 预览使用已保存版本',13,t['--warn-text']);
  button(16,194,358,'保存新版本','primary',44,'check');
  button(16,250,173,'预览与导出', 'secondary',36);button(201,250,173,'版本对比','secondary',36);
  button(16,298,173,'AI优化 / 润色','secondary',36);button(201,298,173,'识别PDF / 图片','secondary',36);
  button(16,346,173,'打印简历','secondary',36);
  text(16,414,'编辑段落',14,undefined,600);
  ['基本信息','教育背景','实习经历','项目经历','技能','证书'].forEach((v,i)=>button(16+(i%3)*122,429+Math.floor(i/3)*44,114,v,i===0?'primary':'secondary',36));
  rect(16,531,358,282,t['--surface'],t['--border'],14);text(32,565,'基本信息',20,undefined,600);
  field(32,601,326,'姓名','林同学（虚构）');field(32,687,326,'联系邮箱','student@example.test');
  text(32,783,'专业、学历继续按单列编辑',13,t['--text-2']);
  rect(16,833,358,370,t['--surface'],t['--border'],14);text(32,868,'教育背景',20,undefined,600);
  field(32,910,326,'学校','示例大学（虚构）');field(32,996,326,'入学日期','2023-09-01');field(32,1082,326,'毕业日期','2027-06-30');
  text(32,1180,'其余教育字段和原有操作均保留',13,t['--text-2']);
  rect(16,1223,358,69,t['--brand-soft'],undefined,10);text(32,1248,'最近保存版本完整度 82.5 · 非录用评价',13,t['--brand-text'],600);text(32,1272,'体检与建议完整区放在全部编辑内容之后。',12,t['--text-2']);
  out.push('</g>');
  lines(20,1406,['静态布局节选，不是可运行表单；中间重复字段作节选说明。','实际页面须完整保留六类段落、附件与所有原操作。','宠物保留，移动停靠须避开软键盘、表单与操作区。'],12,t['--text-2'],21);
  await save('04-resume-mobile',width,height,'390px annotated layout study; not a complete field-by-field prototype.');
}

async function components() {
  const width=1440,height=1130;begin(width,height);
  text(40,54,'D04 · 窗口、组件状态与动态反馈',28,undefined,600);
  text(40,86,'保留原事件和业务条件，只升级可见层；以下为静态状态样例。',14,t['--text-2']);
  rect(40,116,604,540,'#e8edf5',undefined,20);
  text(64,150,'确认窗 · 480px / 原原因校验保持不变',13,'#5a6782');
  rect(102,178,480,430,t['--surface'],t['--border'],20,'filter="url(#shadow)"');
  icon('warning',126,204,24,t['--danger-text']);text(164,225,'驳回本次材料',20,undefined,600);icon('close',534,205,20);
  line(102,250,582,250);field(126,292,432,'驳回原因','请补充签约证明。',{height:130,multiline:true});
  text(126,465,'至少5个字，帮助学生理解下一步。',13,t['--text-2']);text(558,465,'8 / 300',13,t['--text-2'],400,'text-anchor="end"');
  line(102,500,582,500);button(290,530,100,'取消');button(402,530,156,'确认驳回','danger');
  text(64,634,'保留：焦点管理、Esc/关闭条件、滚动锁与提交保护。',13,'#5a6782');
  panel(668,116,732,254,'AI状态：三种含义分开表达','授权 ≠ 服务连接 ≠ 当前任务，不新增每次强制确认');
  const aiRows=[['授权已允许','服务不可用','暂无生成任务'],['授权已允许','服务可用','正在等待真实返回'],['授权已关闭','连接状态独立','未完成请求按原逻辑停止']];
  aiRows.forEach((v,i)=>{const y=206+i*48;badge(692,y-20,v[0],'ai',126);badge(832,y-20,v[1],i===0?'warn':'brand',132);text(982,y,v[2],13,t['--text-1']);});
  panel(668,390,732,266,'按钮与字段：完整状态','尺寸、语义、焦点、处理中和禁用必须统一');
  button(692,468,126,'主要操作','primary');button(832,468,126,'次要操作');button(972,468,126,'危险操作','danger');button(1112,468,126,'不可操作','disabled');
  button(692,530,126,'处理中…','disabled');button(832,530,126,'键盘焦点');rect(828,526,134,52,'none',t['--focus-ring'],13,'stroke-width="2"');
  rect(978,529,380,44,t['--surface'],t['--danger-text'],10);text(992,556,'字段错误：保留输入并明确修正方式',14,t['--danger-text']);
  text(692,626,'触摸目标 44px · 字段名不靠 placeholder 代替 · 禁用原因可读',13,t['--text-2']);
  panel(40,682,604,350,'视觉基础','保留品牌配色，重点重构层级、密度和组件细节');
  [['品牌蓝','#2f55c8'],['AI 紫','#6e56cf'],['成功','#146b49'],['警告','#80520c'],['危险','#b52c36']].forEach(([label,color],i)=>{rect(64+i*112,778,88,52,color,undefined,10);text(64+i*112,854,label,13,t['--text-2']);});
  text(64,907,'标题 28 / 38',28,undefined,600);text(64,947,'正文 14 / 22 · 字段 16 / 24 · 辅助 13 / 20',14,t['--text-2']);
  text(64,981,'圆角 10 / 14 / 20 · 间距以 4px 为基准',14,t['--text-2']);
  panel(668,682,732,350,'动效：传达变化，不推动业务','关闭动效后所有内容、操作、状态仍完整');
  const motions=[['即时反馈','120ms','按钮/焦点，不等待动画再响应'],['状态切换','200ms','标签/提示，保留原始任务状态'],['面板过渡','260ms','位移不超过8px，不重复挂载页面'],['滚动呈现','240ms','内容默认可见，不劫持滚轮']];
  motions.forEach(([label,duration,note],i)=>{const y=790+i*53;text(692,y,label,14,undefined,600);text(809,y,duration,14,t['--brand-text'],600);text(903,y,note,13,t['--text-2']);});
  text(40,1085,'设计目标，不是当前应用已达到的测量结果。新动效不得触发AI、重复请求、改写数据或改变确认门槛。',13,t['--text-2']);
  await save('05-components-overlays-motion',width,height,'Modal, AI state semantics, component states, motion specifications.');
}

async function portal() {
  const width=1440,height=1660;begin(width,height);rect(0,0,width,height,t['--surface']);
  brand(72,25);text(280,50,'岗位机会',14,t['--text-2'],600);text(388,50,'就业服务',14,t['--text-2'],600);icon('moon',1160,31,20);button(1232,20,136,'登录工作台','primary');line(72,88,1368,88);
  text(72,158,'从校园出发 / CAREERPILOT',13,t['--brand-text'],600);
  lines(72,239,['让下一步，','更有方向。'],56,t['--text-1'],72,600);
  text(72,359,'连接值得奔赴的未来，也看见当下可做的准备。',16,t['--text-2']);
  rect(72,396,610,60,t['--surface'],t['--border-control'],12);icon('search',91,415,22);text(128,432,'岗位、企业或专业',16,t['--text-2']);button(572,404,102,'搜索','primary');
  text(72,496,'做好求职准备',14,t['--brand-text'],600);icon('arrow',182,480,20,t['--brand-text']);
  out.push('<defs><clipPath id="campus"><rect x="750" y="140" width="618" height="370" rx="20"/></clipPath></defs>');
  out.push(`<image x="750" y="140" width="618" height="370" href="${photo}" preserveAspectRatio="xMidYMid slice" clip-path="url(#campus)"/>`);
  text(72,585,'发现新的可能',28,undefined,600);text(1264,582,'查看全部',14,t['--brand-text']);icon('chevron',1348,565,18,t['--brand-text']);
  const jobs=[['前端开发工程师','青屿数字（虚构）','上海 · 本科','9–13K / 月'],['数据分析助理','知行智造（虚构）','杭州 · 本科','10–14K / 月'],['产品运营专员','云帆服务（虚构）','南京 · 本科','11–15K / 月']];
  jobs.forEach(([job,company,place,salary],i)=>{const y=641+i*102;line(72,y-20,1368,y-20);rect(72,y,44,44,t['--brand-soft'],undefined,10);icon('company',84,y+11,22,t['--brand-text']);text(136,y+16,job,18,undefined,600);text(136,y+43,company,13,t['--text-2']);text(670,y+25,place,14,t['--text-2']);text(1045,y+25,salary,18,t['--brand-text'],600,'text-anchor="end"');badge(1120,y+4,'本站办理','brand',100);icon('chevron',1342,y+13,20);});
  line(72,927,1368,927);text(72,983,'就业服务，触手可及。',24,undefined,600);text(72,1012,'国家大学生就业服务平台 · 来源与外部跳转明确保留',13,t['--text-2']);
  ['专场招聘','实习岗位','就业指导','就业政策','求职风险提示'].forEach((v,i)=>{const x=750+(i%3)*210,y=958+Math.floor(i/3)*74;rect(x,y,198,62,t['--surface-2'],undefined,10);text(x+20,y+37,v,15,undefined,600);icon('arrow',x+155,y+20,18,t['--brand-text']);});
  text(72,1150,'为下一步，做好准备。',24,undefined,600);
  [['简历工作台','梳理经历，写出你的优势。','resume'],['岗位匹配','了解要求，找到适合的方向。','jobs'],['面试练习','把想法说清楚，从容面对机会。','interview']].forEach(([title,note,ic],i)=>{const x=72+i*440;rect(x,1180,416,142,t['--surface'],t['--border'],14);icon(ic,x+24,1204,24,t['--brand-text']);text(x+24,1260,title,20,undefined,600);text(x+24,1290,note,14,t['--text-2']);icon('arrow',x+366,1240,22,t['--brand-text']);});
  rect(72,1354,1296,144,t['--brand-soft'],undefined,14);
  text(96,1402,'在同一条路上，让机会相遇。',24,undefined,600);text(96,1436,'学生的成长，企业的发现，学校的支持。',14,t['--text-2']);
  button(852,1403,136,'学生注册','primary');button(1000,1403,136,'企业入驻');button(1148,1403,196,'学校工作台');
  line(72,1530,1368,1530);brand(72,1550,true);text(290,1574,'闻鸣知路，循引赴职。',14,t['--text-2']);text(1260,1574,'工作台入口',14,t['--brand-text'],600);
  text(72,1635,'D05 · 门户静态设计首稿 / 复用现有 campus-ai.jpg / 岗位与数字仅为虚构排版样例 / 非运行截图',12,t['--text-2']);
  await save('06-portal-desktop',width,height,'Public portal hierarchy, five existing national-service links, three preparation and three role entrances, footer. Existing production campus image reused.');
}

function brandV02(x,y,size=48,wordSize=26,withSlogan=true) {
  out.push(`<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="19" fill="none" stroke="${t['--brand-text']}" stroke-opacity=".18"/><path d="M8 31 C13 27 13 22 18 19 S27 13 31 9" fill="none" stroke="${t['--brand-text']}" stroke-width="1.5" stroke-dasharray="2.5 3" stroke-linecap="round"/><path d="M10 15 Q13 11 16 15 M12 19 Q16 14 20 19" fill="none" stroke="${t['--brand-text']}" stroke-width="1.3" stroke-linecap="round" opacity=".75"/><circle cx="31" cy="9" r="2.6" fill="${t['--ai']}"/><path d="M28 6 L28 3 M33 12 L36 12" stroke="${t['--brand-text']}" stroke-width="1.2" stroke-linecap="round" opacity=".6"/></svg>`);
  text(x+size+14,y+wordSize,'路鸣职引',wordSize,t['--text-1'],600,'letter-spacing="1"');
  text(x+size+14,y+wordSize+21,'CareerPilot',12,t['--text-2'],400,'letter-spacing="1.2"');
  if(withSlogan){line(x+size+168,y+5,x+size+168,y+size-3,t['--border-control']);text(x+size+192,y+30,'闻鸣知路，循引赴职。',14,t['--brand-text'],400,'letter-spacing=".6"');}
}
function backdropV02(width,height,dark=false,kind='portal') {
  const blue=dark?'#25418b':'#cbdcff',teal=dark?'#164542':'#c5ede6';
  out.push(`<defs><radialGradient id="wash-blue"><stop stop-color="${blue}" stop-opacity="${dark?.34:.55}"/><stop offset="1" stop-color="${blue}" stop-opacity="0"/></radialGradient><radialGradient id="wash-teal"><stop stop-color="${teal}" stop-opacity="${dark?.24:.40}"/><stop offset="1" stop-color="${teal}" stop-opacity="0"/></radialGradient></defs>`);
  rect(0,96,width,kind==='portal'?460:280,'url(#wash-blue)');
  out.push(`<ellipse cx="${width*.91}" cy="300" rx="${width*.34}" ry="280" fill="url(#wash-teal)"/>`);
  out.push(`<g fill="none" stroke="${t['--brand-text']}" stroke-width="1.2" opacity="${dark?.19:.12}"><path d="M${width-150} 100 C${width-60} 150 ${width-40} 330 ${width-20} 460"/><path d="M${width-240} 100 C${width-120} 180 ${width-100} 390 ${width+20} 520" stroke-dasharray="3 7"/></g>`);
  circle(width-113,154,4,t['--brand-text'],'opacity=".2"');circle(width-39,398,4,t['--teal'],'opacity=".25"');
}
function navPill(x,y,w,label,ic='arrow',selected=false) {
  rect(x,y,w,44,selected?t['--brand-soft']:t['--surface'],selected?t['--brand-soft']:t['--border'],10);
  text(x+16,y+28,label,14,selected?t['--brand-text']:t['--text-1'],600);icon(ic,x+w-34,y+14,16,t['--brand-text']);
}
async function portalV02(dark=false) {
  const width=1440,height=1660;begin(width,height,dark);rect(0,0,width,height,t['--surface']);backdropV02(width,height,dark);
  rect(0,0,width,96,t['--surface']);
  brandV02(72,23);navPill(840,26,128,'岗位机会','jobs',true);navPill(980,26,128,'就业服务','help');
  rect(1124,26,44,44,t['--surface'],t['--border'],10);icon(dark?'sun':'moon',1136,38,20,t['--text-2']);button(1192,26,176,'登录工作台','primary',44,'arrow');line(72,95,1368,95);
  text(72,158,'从校园出发 / CAREERPILOT',12,t['--brand-text'],600,'letter-spacing="1.2"');
  lines(72,239,['让下一步，','更有方向。'],56,t['--text-1'],72,600);
  line(74,327,158,327,t['--brand-text'],3);circle(169,327,3,t['--teal']);
  text(72,359,'连接值得奔赴的未来，也看见当下可做的准备。',16,t['--text-2']);
  rect(72,396,610,60,t['--surface'],t['--border-control'],12,'filter="url(#shadow)"');icon('search',91,415,22);text(128,432,'岗位、企业或专业',16,t['--text-2']);button(566,404,108,'搜索','primary');
  navPill(72,478,194,'做好求职准备');
  rect(742,132,634,386,t['--surface'],t['--border'],24,'filter="url(#shadow)"');
  out.push('<defs><clipPath id="campus-v02"><rect x="750" y="140" width="618" height="370" rx="18"/></clipPath></defs>');
  out.push(`<image x="750" y="140" width="618" height="370" href="${photo}" preserveAspectRatio="xMidYMid slice" clip-path="url(#campus-v02)"/>`);
  text(72,585,'发现新的可能',28,undefined,600);navPill(1236,552,132,'查看全部','chevron');
  const jobs=[['前端开发工程师','青屿数字（虚构）','上海 · 本科','9–13K / 月'],['数据分析助理','知行智造（虚构）','杭州 · 本科','10–14K / 月'],['产品运营专员','云帆服务（虚构）','南京 · 本科','11–15K / 月']];
  jobs.forEach(([job,company,place,salary],i)=>{const y=633+i*98;rect(72,y-12,1296,88,t['--surface'],t['--border'],14);rect(88,y+7,48,48,t['--brand-soft'],undefined,12);icon('company',101,y+20,22,t['--brand-text']);text(156,y+22,job,18,undefined,600);text(156,y+49,company,13,t['--text-2']);text(670,y+33,place,14,t['--text-2']);text(1045,y+33,salary,18,t['--brand-text'],600,'text-anchor="end"');badge(1120,y+11,'本站办理','brand',100);circle(1332,y+31,17,t['--surface-2']);icon('arrow',1323,y+22,18,t['--brand-text']);});
  text(72,938,'岗位仅为虚构排版样例 · 来源类型、跳转及真实条数保持原逻辑',12,t['--text-2']);
  text(72,995,'就业服务，触手可及。',24,undefined,600);text(72,1024,'国家大学生就业服务平台',13,t['--text-2']);
  const services=[['专场招聘','jobs'],['实习岗位','company'],['就业指导','help'],['就业政策','agreement'],['求职风险提示','warning']];
  services.forEach(([v,ic],i)=>{const x=750+(i%3)*210,y=958+Math.floor(i/3)*74;rect(x,y,198,62,t['--surface'],t['--border'],12);icon(ic,x+16,y+20,20,t['--brand-text']);text(x+48,y+37,v,14,undefined,600);icon('arrow',x+167,y+23,16,t['--brand-text']);});
  text(72,1150,'为下一步，做好准备。',24,undefined,600);
  [['简历工作台','梳理经历，写出你的优势。','resume'],['岗位匹配','了解要求，找到适合的方向。','jobs'],['面试练习','把想法说清楚，从容面对机会。','interview']].forEach(([title,note,ic],i)=>{const x=72+i*440;rect(x,1180,416,142,t['--surface'],t['--border'],14);rect(x+22,1201,40,40,t['--brand-soft'],undefined,11);icon(ic,x+30,1209,24,t['--brand-text']);text(x+82,1228,'0'+(i+1)+' / 求职准备',12,t['--text-2']);text(x+24,1271,title,20,undefined,600);text(x+24,1300,note,14,t['--text-2']);circle(x+375,1268,18,t['--brand-soft']);icon('arrow',x+366,1259,18,t['--brand-text']);});
  rect(72,1354,1296,144,t['--brand-soft'],undefined,14);
  text(96,1402,'在同一条路上，让机会相遇。',24,undefined,600);text(96,1436,'学生的成长，企业的发现，学校的支持。',14,t['--text-2']);
  button(852,1403,136,'学生注册','primary');button(1000,1403,136,'企业入驻');button(1148,1403,196,'学校工作台','secondary',44,'arrow');
  line(72,1530,1368,1530);brandV02(72,1550,36,18,false);text(300,1575,'闻鸣知路，循引赴职。',13,t['--text-2']);navPill(1210,1545,158,'工作台入口');
  text(72,1635,'v0.2 · 顶部品牌 / 入口细化 / 内容底层渲染 · 静态评审图，不是产品截图或已实现界面',12,t['--text-2']);
  await save(dark?'08-portal-refined-dark':'07-portal-refined-light',width,height,'v0.2 static design: approved portal layout retained; prominent top brand, link styling and background layer.');
}
async function portalMobileV02() {
  const width=390,height=1560;begin(width,height);rect(0,0,width,height,t['--surface']);backdropV02(width,height,false);
  rect(0,0,width,167,t['--surface']);brandV02(20,22,44,24,false);text(78,98,'闻鸣知路，循引赴职。',14,t['--brand-text']);
  rect(326,27,44,44,t['--surface'],t['--border'],10);icon('moon',338,39,20);
  navPill(20,116,104,'岗位机会','jobs',true);navPill(134,116,104,'就业服务','help');button(248,116,122,'登录工作台','primary');line(20,178,370,178);
  text(20,217,'从校园出发 / CAREERPILOT',12,t['--brand-text'],600);
  lines(20,269,['让下一步，','更有方向。'],36,t['--text-1'],48,600);text(20,356,'连接未来，也看见当下可做的准备。',14,t['--text-2']);
  rect(20,380,350,56,t['--surface'],t['--border-control'],12);icon('search',34,398,20);text(66,415,'岗位、企业或专业',15,t['--text-2']);button(286,386,78,'搜索','primary');
  navPill(20,453,194,'做好求职准备');
  out.push('<defs><clipPath id="mobile-campus"><rect x="20" y="520" width="350" height="210" rx="16"/></clipPath></defs>');
  out.push(`<image x="20" y="520" width="350" height="210" href="${photo}" preserveAspectRatio="xMidYMid slice" clip-path="url(#mobile-campus)"/>`);
  text(20,783,'发现新的可能',24,undefined,600);navPill(248,752,122,'查看全部','chevron');
  rect(20,810,350,125,t['--surface'],t['--border'],14);icon('company',36,831,22,t['--brand-text']);text(70,849,'前端开发工程师',18,undefined,600);text(36,879,'青屿数字（虚构） · 上海 · 本科',13,t['--text-2']);text(36,913,'9–13K / 月',18,t['--brand-text'],600);badge(236,891,'本站办理','brand',104);
  text(20,964,'虚构排版样例 · 列表行重复部分节选',12,t['--text-2']);
  text(20,1014,'就业服务，触手可及。',22,undefined,600);text(20,1043,'国家大学生就业服务平台',13,t['--text-2']);
  ['专场招聘','实习岗位','就业指导','就业政策','求职风险提示'].forEach((v,i)=>navPill(20+(i%2)*180,1064+Math.floor(i/2)*58,170,v));
  rect(20,1252,350,223,t['--brand-soft'],undefined,14);text(38,1285,'下方原有完整内容继续保留',16,t['--brand-text'],600);
  lines(38,1322,['三项准备：简历 / 匹配 / 面试','角色入口：学生注册 / 企业入驻','学校工作台与页脚入口','此图仅演示移动重排，不是完整页面。'],13,t['--text-2'],30);
  text(20,1526,'v0.2 · 390px手机布局研究 · 非运行截图',12,t['--text-2']);
  await save('09-portal-mobile-study',width,height,'Annotated mobile study; complete lower-page sections explicitly retained, not a complete prototype.');
}
async function backgroundBoardV02() {
  const width=1440,height=1050;begin(width,height);
  text(48,62,'内容之下，有方向的背景。',30,undefined,600);text(48,97,'v0.2 / 全站背景层与入口状态细化 · 非运行截图',14,t['--text-2']);
  panel(48,133,652,350,'L0–L3：背景与内容分层','装饰不改变业务结构，不接收事件，不进入朗读顺序');
  const layerRows=[['L3','浮层 / Toast / 宠物','沿用已有层级，避免新增遮挡'],['L2','内容 / 表单 / 图表','实底表面，文字与数据清晰'],['L1','渐变 / 路径 / 航点','pointer-events:none · aria-hidden'],['L0','主题基底','深浅主题分别配置，支持打印回退']];
  layerRows.forEach(([id,title,note],i)=>{const y=224+i*60;badge(72,y-18,id,'brand',46);text(136,y,title,15,undefined,600);text(136,y+22,note,13,t['--text-2']);});
  panel(724,133,668,350,'同一主题，按页面任务调整强度','不把所有页面都铺成相同的大背景图');
  [['公共门户 / 登录','轻渐变 + 边缘路径；原校园图单独保留'],['学生/企业/辅导员/管理员概览','标题周围轻染色；卡片、表格保持实底'],['简历 / 审核 / 录音 / 文书','最低装饰强度；不穿过输入和证据区'],['图表 / 数据 / 打印','绘图区纯色；打印移除装饰背景']].forEach(([title,note],i)=>{const y=226+i*64;text(748,y,title,15,undefined,600);text(748,y+25,note,13,t['--text-2']);});
  panel(48,507,652,272,'导航入口：同一语义，多种状态','悬停、焦点和按下仅改变呈现，不改href、权限或事件');
  navPill(72,598,170,'岗位机会','jobs');navPill(260,598,170,'岗位机会','jobs',true);navPill(448,598,170,'岗位机会','jobs',true);rect(444,594,178,52,'none',t['--focus-ring'],13,'stroke-width="2"');
  text(72,679,'默认 · 可发现',13,t['--text-2']);text(260,679,'悬停 / 当前项',13,t['--text-2']);text(448,679,'键盘焦点',13,t['--text-2']);text(72,743,'44px触点 · 文字不只靠颜色 · 外链来源/跳转说明保留',13,t['--text-2']);
  panel(724,507,668,272,'动效与安全约束','动态的用途是表达层级与反馈，不是制造忙碌感');
  lines(748,607,['hover 120ms；面板/状态 200ms；位移 ≤ 4–8px。','prefers-reduced-motion 下关闭位移与持续装饰。','不启用滚动劫持、自动滚动业务表、假AI进度。','不改 RouterView key，不重复挂载，不增加请求。','不替代现有自选工作区图片及其保存/回退语义。'],14,t['--text-2'],30);
  panel(48,803,1344,166,'实施前核验','这是设计规范，不是已通过的性能或业务回归结果');
  text(72,903,'主题 × 页面族 × 390/1440 × 键盘/缩放 × 减少动态 × 打印；同时检查原入口、AI调用次数与生命周期。',14,t['--text-2']);
  text(48,1010,'Figma Make 独立样稿与本地细化稿分别记录；云端静态预览不能验证本机在线权限、数据或AI。',13,t['--text-2']);
  await save('10-background-navigation-spec',width,height,'Background layering, per-page intensity, navigation states and non-regression design contract.');
}

if(v02){
  await portalV02(false);await portalV02(true);await portalMobileV02();await backgroundBoardV02();
} else {
  await dashboard(true);await dashboard(false);await resumeDesktop();await resumeMobile();await components();await portal();
}

function luminance(hex) {
  const channels=hex.replace('#','').match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
}
const contrast=[];
for(const theme of ['light','dark']){
  const colors=tokens.themes[theme];
  for(const [foreground,background] of [['--text-1','--surface'],['--text-2','--surface'],['--text-3','--surface'],['--on-brand','--brand'],['--brand-text','--surface'],['--warn-text','--warn-soft'],['--danger-text','--danger-soft'],['--ai-text','--ai-soft']]){
    const a=luminance(colors[foreground]),b=luminance(colors[background]),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    contrast.push({theme,foreground,background,ratio:Number(ratio.toFixed(3)),passesNormalText:ratio>=4.5});
  }
}
const report={generatedAt:new Date().toISOString(),revision:v02?'0.2':'0.1',kind:'static design artifact verification, NOT application test results',artifacts:reports,contrast,limitations:['No rendered application was modified or tested','Mobile is an annotated viewport study, not a complete field-by-field prototype',v02?'Figma Make inspected separately in Edge; native Design-file library discovery is not applicable to this Make file':'Figma target-file discovery has not occurred','Synthetic chart data; final chart bbox and runtime contrast require browser verification','No AI, DB, service sync, credential access or network calls in renderer']};
fs.writeFileSync(path.join(outputDir,'design-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
