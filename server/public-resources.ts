export interface PublicResource {
  id: string; kind: 'job'|'fair'|'guidance'|'policy'|'risk'; title: string; employer: string | null;
  location: string | null; url: string; source: string; observedAt: string; publishedAt: string | null; deadline: string | null;
}
const observedAt = '2026-11-14T15:43:00+08:00';
const source = '国家大学生就业服务平台';
// Curated link index from a public-page observation, not a mirror or local employer feed.
// No contact details, resumes, ownership assertions or guessed expiry dates are imported.
export function normalizeResources(input: PublicResource[]): PublicResource[] {
  const rows = new Map<string, PublicResource>();
  for (const row of input) {
    let url: URL; try { url = new URL(row.url); } catch { throw Error('INVALID_SOURCE'); }
    if (url.protocol !== 'https:' || url.hostname !== 'www.ncss.cn' || url.port || url.username || url.password || url.search || url.hash || !row.title.trim() || row.title.length > 200 || !Number.isFinite(Date.parse(row.observedAt))) throw Error('INVALID_SOURCE');
    if (row.deadline !== null && !Number.isFinite(Date.parse(row.deadline))) throw Error('INVALID_SOURCE');
    rows.set(url.href, { ...row, url: url.href, source });
  }
  return [...rows.values()];
}
export const officialResources = normalizeResources([
  {id:'ncss-Whw7FLcsHztpyWF7GLWhwB',kind:'job',title:'客户运营',employer:'中邮消费金融有限公司',location:'广东',url:'https://www.ncss.cn/student/jobs/Whw7FLcsHztpyWF7GLWhwB/detail.html',source,observedAt,publishedAt:'2026-10-21T09:51:00+08:00',deadline:null},
  {id:'ncss-9kTDoqf1C7mcozfnRkTmVh',kind:'job',title:'数据标注员',employer:'潍坊蚂蚁智图电子科技有限责任公司',location:'吉林',url:'https://www.ncss.cn/student/jobs/9kTDoqf1C7mcozfnRkTmVh/detail.html',source,observedAt,publishedAt:'2026-11-13T17:26:00+08:00',deadline:null},
  {id:'ncss-FCe86sKJs4yCMxbvEa91sZ',kind:'job',title:'PS修图美工AI设计绘图',employer:'北京金润达文化传播有限公司',location:'北京',url:'https://www.ncss.cn/student/jobs/FCe86sKJs4yCMxbvEa91sZ/detail.html',source,observedAt,publishedAt:'2026-11-13T17:29:00+08:00',deadline:null},
  ...([
    ['fair','专场招聘','https://www.ncss.cn/student/jobfair/index.html'],
    ['guidance','就业指导','https://www.ncss.cn/zdxw'],
    ['policy','就业政策','https://www.ncss.cn/zcxw'],
    ['risk','求职风险提示','https://www.ncss.cn/jyfxts'],
  ] as const).map(([kind,title,url])=>({id:`ncss-${kind}`,kind,title,url,source,observedAt,publishedAt:null,deadline:null,employer:null,location:null})),
]);
