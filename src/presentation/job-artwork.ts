// Presentation-only module. No business classification, ranking, requests or persistence.
type Family = 'frontend'|'backend'|'analytics'|'operations'|'algorithm'|'testing'|'engineering'|'design'|'finance'|'education'|'health'|'logistics';
function family(title: string): Family {
  const rules: [RegExp,Family][] = [
    [/前端|网页|web|界面/i,'frontend'],[/后端|服务端|java|数据库/i,'backend'],
    [/算法|人工智能|机器学习|AI/i,'algorithm'],[/数据|分析|统计/,'analytics'],
    [/运营|营销|市场|产品|销售/,'operations'],[/测试|质量|QA/i,'testing'],
    [/设计|创意|视觉/,'design'],[/财务|金融|会计|银行/,'finance'],
    [/教育|教师|培训/,'education'],[/医疗|生物|医药|护理/,'health'],
    [/物流|运输|供应链/,'logistics'],
  ];
  return rules.find(([pattern])=>pattern.test(title))?.[1] ?? 'engineering';
}
function hash(id: string): number { return Array.from(id).reduce((n,c)=>(n*31+c.codePointAt(0)!)>>>0,0); }
const path=(name:string,variant:number)=>`/media/career/jobs/${name}-${variant}.webp`;
export function jobArtwork(title: string, id: string, _index?: number): string {
  void _index;
  // The same record keeps its visual identity across overview, search and filtering.
  return path(family(title), [1,3][hash(id.replace(/^local:/,'')) % 2]!);
}
export function jobArtworkBatch(items: readonly {title: string; id: string}[]): string[] {
  // A finite illustration library may repeat; never substitute an unrelated domain
  // or change a record's picture just because another row was inserted before it.
  return items.map(item=>jobArtwork(item.title,item.id));
}
