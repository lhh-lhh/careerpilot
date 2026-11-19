// Approved presentation metadata only: no data fetching, business state or side effects.
export const workbenchPages = [
  {
    "id": "S01",
    "role": "student",
    "route": "/student",
    "title": "生涯概览",
    "headline": "让下一步，更有方向。",
    "desc": "从简历、岗位到面试，把今天值得推进的事放在眼前。",
    "art": "student-a-01",
    "type": "overview",
    "actions": [
      "完善简历",
      "查看全部岗位",
      "查看投递时间轴"
    ],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "S02",
    "role": "student",
    "route": "/student/resume",
    "title": "简历工作台",
    "headline": "把经历，写成你的优势。",
    "desc": "结构化编辑，逐段完善；正式简历与历史版本始终保留。",
    "art": "student-a-02",
    "type": "resume",
    "actions": [
      "预览与导出简历",
      "AI优化 / 润色",
      "识别PDF / 图片文字",
      "版本对比",
      "打印简历",
      "保存简历"
    ],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "S03",
    "role": "student",
    "route": "/student/resume/suggestions",
    "title": "表达建议对照",
    "headline": "让表达更清楚，不替你编经历。",
    "desc": "原文与建议并排查看，逐条采纳或驳回；所有建议绑定保存版本。",
    "art": "student-a-03",
    "type": "suggestions",
    "actions": [
      "编辑主页面",
      "收起建议子页",
      "生成表达建议"
    ],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "S04",
    "role": "student",
    "route": "/student/resume/optimize",
    "title": "AI优化简历",
    "headline": "把表达打磨好，把选择留给你。",
    "desc": "分部分采纳到草稿，核对后一次保存；不编造经历、技能或业绩。",
    "art": "student-a-04",
    "type": "optimize",
    "actions": [
      "识别PDF / 图片文字",
      "返回简历工作台",
      "查看保存版本"
    ],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "S05",
    "role": "student",
    "route": "/student/resume/import",
    "title": "AI文档识别",
    "headline": "将文档识别为可核对的文字。",
    "desc": "逐页展示识别结果，不自动修改正式简历，也不认证证书真伪。",
    "art": "student-a-05",
    "type": "ocr",
    "actions": [
      "返回简历工作台"
    ],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "S06",
    "role": "student",
    "route": "/student/resume/preview",
    "title": "简历预览与导出",
    "headline": "你的经历，值得被认真看见。",
    "desc": "预览最近保存的正式简历；站内投递采用同一份授权快照。",
    "art": "student-a-06",
    "type": "preview",
    "actions": [
      "返回简历工作台"
    ],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "S07",
    "role": "student",
    "route": "/student/jobs",
    "title": "岗位匹配",
    "headline": "找到适合你的下一站。",
    "desc": "岗位事实、规则匹配依据与AI建议分开呈现，选择始终由你作出。",
    "art": "student-a-07",
    "type": "jobs",
    "actions": [
      "AI岗位匹配",
      "我的求职记录"
    ],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "S08",
    "role": "student",
    "route": "/student/jobs/matches",
    "title": "AI岗位匹配结果",
    "headline": "找到方向，也看清差距。",
    "desc": "真实候选资料生成推荐顺序与理由；未知信息不视为符合。",
    "art": "student-a-08",
    "type": "matches",
    "actions": [
      "返回岗位主页面",
      "先优化简历"
    ],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "S09",
    "role": "student",
    "route": "/student/opportunities",
    "title": "我的求职记录",
    "headline": "让每一次关注，都有后续。",
    "desc": "集中管理收藏与个人求职进展；站外记录不冒充站内投递。",
    "art": "student-a-09",
    "type": "records",
    "actions": [
      "浏览岗位机会"
    ],
    "mode": "仅在线"
  },
  {
    "id": "S10",
    "role": "student",
    "route": "/student/mock",
    "title": "模拟面试 · 在线入口",
    "headline": "每一道问题，都根据你的回答继续。",
    "desc": "在线默认进入文字面试；不开启语音时，不自动调用语音合成或识别。",
    "art": "student-a-10",
    "type": "text",
    "actions": [
      "进入语音面试",
      "题库快速练习",
      "查看旧规则练习报告"
    ],
    "mode": "仅在线 · 文字面试入口别名"
  },
  {
    "id": "S11",
    "role": "student",
    "route": "/student/mock/text",
    "title": "文字输入法面试",
    "headline": "认真组织语言，从容表达自己。",
    "desc": "DeepSeek根据目标岗位动态提问、追问与评价；默认文字作答。",
    "art": "student-a-10",
    "type": "text",
    "actions": [
      "进入语音面试",
      "题库快速练习",
      "查看旧规则练习报告"
    ],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "S12",
    "role": "student",
    "route": "/student/mock/voice",
    "title": "仿真语音面试",
    "headline": "像面试一样，开口练习。",
    "desc": "整段语音识别有等待，不是双工实时通话；文字作答始终可用。",
    "art": "student-a-11",
    "type": "voice",
    "actions": [
      "切换文字面试",
      "题库快速练习",
      "查看旧规则练习报告"
    ],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "S13",
    "role": "student",
    "route": "/student/mock/practice",
    "title": "题库练习",
    "headline": "选一个方向，先练起来。",
    "desc": "以你喜欢的题库页为品质基准：大图、清晰信息与明确行动。",
    "art": "student-a-12",
    "type": "practice",
    "actions": [
      "换一组"
    ],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "S14",
    "role": "student",
    "route": "/student/mock",
    "title": "模拟面试 · 离线规则练习",
    "headline": "先练习，再从容表达。",
    "desc": "保留原有规则练习与暂停、继续、提前结束流程，不冒充在线AI。",
    "art": "student-b-01",
    "type": "offline-interview",
    "actions": [
      "查看练习报告"
    ],
    "mode": "仅离线 · 与在线同路由不同内容"
  },
  {
    "id": "S15",
    "role": "student",
    "route": "/student/mock/report",
    "title": "旧规则练习报告",
    "headline": "每一次表达，都能更进一步。",
    "desc": "逐题证据与固定规则评分，和AI量规分别展示，不互相混用。",
    "art": "student-b-02",
    "type": "rule-report",
    "actions": [
      "返回练习",
      "打印报告"
    ],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "S16",
    "role": "student",
    "route": "/student/mock/voice/report",
    "title": "AI语音面试反馈",
    "headline": "看见亮点，找到下一次的进步。",
    "desc": "只读取本场已保存回答与逐轮评价；打开报告不重新调用模型。",
    "art": "student-b-03",
    "type": "voice-report",
    "actions": [
      "返回面试练习"
    ],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "S17",
    "role": "student",
    "route": "/student/mock/feedback",
    "title": "AI文字面试反馈",
    "headline": "让每一段回答，都有改进依据。",
    "desc": "文字报告与语音报告使用同一评价边界，不推断口音或声调。",
    "art": "student-b-04",
    "type": "text-report",
    "actions": [
      "返回面试练习"
    ],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "S18",
    "role": "student",
    "route": "/student/applications",
    "title": "我的投递",
    "headline": "每一步进展，都有迹可循。",
    "desc": "投递、面试、录用意向与授权快照，沿时间线清晰呈现。",
    "art": "student-b-05",
    "type": "applications",
    "actions": [
      "继续了解岗位"
    ],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "S19",
    "role": "student",
    "route": "/student/destination",
    "title": "协议与毕业去向",
    "headline": "把重要的下一步，稳妥落定。",
    "desc": "去向填报、证明材料、审核历史与协议状态分区呈现。",
    "art": "student-b-06",
    "type": "destination",
    "actions": [],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "S20",
    "role": "student",
    "route": "/student/service",
    "title": "站内服务",
    "headline": "遇到问题，有迹可循地解决。",
    "desc": "提交问题，查看答复与办理记录；工单仅本人和管理员可见。",
    "art": "student-b-07",
    "type": "service",
    "actions": [
      "刷新队列"
    ],
    "mode": "仅在线"
  },
  {
    "id": "S21",
    "role": "student",
    "route": "/student/data-check",
    "title": "本机数据检查",
    "headline": "你的本机数据，清楚可见。",
    "desc": "检查草稿、附件和匹配性能；与在线服务端数据明确区分。",
    "art": "student-b-08",
    "type": "data",
    "actions": [],
    "mode": "仅离线"
  },
  {
    "id": "S22",
    "role": "student",
    "route": "/account",
    "title": "我的账号",
    "headline": "身份清晰，访问安心。",
    "desc": "查看审核状态与账号信息；密码修改后，所有设备需要重新登录。",
    "art": "student-b-09",
    "type": "account",
    "actions": [],
    "mode": "仅在线"
  },
  {
    "id": "C01",
    "role": "company",
    "route": "/company",
    "title": "招聘概览",
    "headline": "让每一次招聘推进，都有清晰依据。",
    "desc": "从岗位到候选人，把需要处理的动作落到人。",
    "art": "company-01",
    "type": "company-overview",
    "actions": [
      "发布新岗位"
    ],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "C02",
    "role": "company",
    "route": "/company/jobs",
    "title": "岗位管理",
    "headline": "把岗位写清楚，让机会被看见。",
    "desc": "招聘事实、审核状态与发布操作同屏可见。",
    "art": "company-02",
    "type": "company-jobs",
    "actions": [
      "发布新岗位"
    ],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "C03",
    "role": "company",
    "route": "/company/candidates",
    "title": "候选人流程",
    "headline": "每一位候选人，都值得认真回应。",
    "desc": "查看授权简历快照、面试记录与当前招聘阶段。",
    "art": "company-03",
    "type": "candidates",
    "actions": [],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "C04",
    "role": "company",
    "route": "/company/schedule",
    "title": "面试日程",
    "headline": "让每一次见面，安排有序。",
    "desc": "日程按北京时间显示；调整和响应保留原有规则。",
    "art": "company-04",
    "type": "schedule",
    "actions": [
      "返回候选人流程"
    ],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "C05",
    "role": "company",
    "route": "/company/agreements",
    "title": "就业协议",
    "headline": "让每一份约定，都清楚可追溯。",
    "desc": "录用意向、就业协议与文书历史分别呈现。",
    "art": "company-05",
    "type": "agreements",
    "actions": [],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "C06",
    "role": "company",
    "route": "/company/service",
    "title": "企业站内服务",
    "headline": "把问题说明白，让协作更顺畅。",
    "desc": "只展示本企业账号可见工单，不扩展资料权限。",
    "art": "company-06",
    "type": "service",
    "actions": [
      "刷新队列"
    ],
    "mode": "仅在线"
  },
  {
    "id": "C07",
    "role": "company",
    "route": "/company/data-check",
    "title": "企业本机数据检查",
    "headline": "让招聘演示数据，透明可核对。",
    "desc": "检查本机草稿、附件与持久化状态；不操作在线数据库。",
    "art": "company-07",
    "type": "data",
    "actions": [],
    "mode": "仅离线"
  },
  {
    "id": "C08",
    "role": "company",
    "route": "/account",
    "title": "企业账号",
    "headline": "把企业身份，妥善管理。",
    "desc": "审核、账号访问与密码修改保持原有逻辑。",
    "art": "company-08",
    "type": "account",
    "actions": [],
    "mode": "仅在线"
  },
  {
    "id": "C09",
    "role": "company",
    "route": "/company/overview",
    "title": "招聘概览 · 别名",
    "headline": "让每一次招聘推进，都有清晰依据。",
    "desc": "这是招聘概览的现有别名，不新增一个业务页面。",
    "art": "company-01",
    "type": "company-overview",
    "actions": [
      "发布新岗位"
    ],
    "mode": "在线 / 离线 · 现有别名"
  },
  {
    "id": "T01",
    "role": "counselor",
    "route": "/counselor",
    "title": "学生名册",
    "headline": "看见材料，也看见背后的人。",
    "desc": "学生、简历与去向状态清晰可查，仅查看本人辖区。",
    "art": "company-09",
    "type": "roster",
    "actions": [],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "T02",
    "role": "counselor",
    "route": "/counselor/review",
    "title": "去向审核",
    "headline": "每一份材料，都有明确的办理依据。",
    "desc": "原材料、关联依据和审核历史不被装饰图遮挡。",
    "art": "company-10",
    "type": "review",
    "actions": [],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "T03",
    "role": "counselor",
    "route": "/counselor/dashboard",
    "title": "就业质量驾驶舱",
    "headline": "从整体趋势，到需要被看见的一个人。",
    "desc": "保持统计口径、风险规则和脱敏问数边界。",
    "art": "company-11",
    "type": "dashboard",
    "actions": [
      "导出当前视图"
    ],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "T04",
    "role": "counselor",
    "route": "/counselor/support",
    "title": "帮扶跟进",
    "headline": "从一次核实，到持续行动。",
    "desc": "保留行动计划、复查、结案和重开，明确学生可见内容。",
    "art": "company-12",
    "type": "support",
    "actions": [
      "新建帮扶"
    ],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "T05",
    "role": "counselor",
    "route": "/counselor/service",
    "title": "辅导员站内服务",
    "headline": "让教学支持，与问题处理衔接。",
    "desc": "提交问题并追踪办理，只展示原授权范围。",
    "art": "governance-01",
    "type": "service",
    "actions": [
      "刷新队列"
    ],
    "mode": "仅在线"
  },
  {
    "id": "T06",
    "role": "counselor",
    "route": "/counselor/data-check",
    "title": "辅导员本机数据检查",
    "headline": "让演示档案，保存得有据可查。",
    "desc": "本机草稿与附件检查，不改变学生权限。",
    "art": "governance-02",
    "type": "data",
    "actions": [],
    "mode": "仅离线"
  },
  {
    "id": "T07",
    "role": "counselor",
    "route": "/account",
    "title": "辅导员账号",
    "headline": "为每一份责任，建立清晰身份。",
    "desc": "账号状态、工作台入口与密码管理。",
    "art": "governance-03",
    "type": "account",
    "actions": [],
    "mode": "仅在线"
  },
  {
    "id": "A01",
    "role": "admin",
    "route": "/admin",
    "title": "管理控制台",
    "headline": "平台运行与账号治理。",
    "desc": "只展示版本、来源、业务计数和脱敏审计，不读取完整简历或附件。",
    "art": "governance-04",
    "type": "console",
    "actions": [
      "导出脱敏审计"
    ],
    "mode": "仅在线"
  },
  {
    "id": "A02",
    "role": "admin",
    "route": "/admin/accounts",
    "title": "账号审核",
    "headline": "让每一次开通，都有清晰归属。",
    "desc": "按原规则审核学生、企业及受邀同事身份。",
    "art": "governance-05",
    "type": "accounts",
    "actions": [
      "刷新"
    ],
    "mode": "仅在线"
  },
  {
    "id": "A03",
    "role": "admin",
    "route": "/admin/admission",
    "title": "准入与岗位审核",
    "headline": "核实主体，让机会可靠呈现。",
    "desc": "准入、岗位审核与辖区交接分区；影响范围必须明确。",
    "art": "governance-06",
    "type": "admission",
    "actions": [
      "刷新队列"
    ],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "A04",
    "role": "admin",
    "route": "/admin/opportunities",
    "title": "机会来源管理",
    "headline": "每一条机会，都能追溯来源。",
    "desc": "保持候选、已发布、来源核实与状态管理逻辑。",
    "art": "governance-07",
    "type": "sources",
    "actions": [
      "同步国家平台"
    ],
    "mode": "仅在线"
  },
  {
    "id": "A05",
    "role": "admin",
    "route": "/admin/service",
    "title": "管理员站内服务",
    "headline": "让每一个问题，都得到明确回应。",
    "desc": "办理、答复、结案及重开遵循原角色权限。",
    "art": "governance-08",
    "type": "service",
    "actions": [
      "刷新队列"
    ],
    "mode": "仅在线"
  },
  {
    "id": "A06",
    "role": "admin",
    "route": "/admin/data-check",
    "title": "管理员本机数据检查",
    "headline": "把本机状态，检查得清清楚楚。",
    "desc": "演示环境复位与在线账号治理保持隔离。",
    "art": "governance-09",
    "type": "data",
    "actions": [],
    "mode": "仅离线"
  },
  {
    "id": "A07",
    "role": "admin",
    "route": "/account",
    "title": "管理员账号",
    "headline": "高权限身份，更需清晰与克制。",
    "desc": "账号状态与密码操作保留原安全规则。",
    "art": "governance-10",
    "type": "account",
    "actions": [],
    "mode": "仅在线"
  },
  {
    "id": "A08",
    "role": "admin",
    "route": "/admin",
    "title": "离线管理控制台",
    "headline": "让演示环境透明、可追溯、可复位。",
    "desc": "固定种子、角色模拟、来源与演示复位明确标注。",
    "art": "governance-04",
    "type": "offline-console",
    "actions": [
      "导出脱敏审计"
    ],
    "mode": "仅离线 · 与在线同路由不同内容"
  },
  {
    "id": "X01",
    "role": "shared",
    "route": "/forbidden",
    "title": "暂无访问权限",
    "headline": "这里需要相应的访问权限。",
    "desc": "不显示受保护业务信息；只保留原有安全返回入口。",
    "art": "student-b-10",
    "type": "forbidden",
    "actions": [],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "X02",
    "role": "shared",
    "route": "/not-found",
    "title": "未找到页面",
    "headline": "这条路径，暂时没有抵达。",
    "desc": "保留安全返回，不把装饰插图当作可点击导航。",
    "art": "student-b-11",
    "type": "notfound",
    "actions": [],
    "mode": "在线 / 离线共用"
  },
  {
    "id": "X03",
    "role": "shared",
    "route": "/design-system",
    "title": "灯塔设计系统",
    "headline": "清晰，是最好的指引。",
    "desc": "组件、颜色、状态与交互规范，明确区分演示与业务。",
    "art": "student-b-12",
    "type": "design-system",
    "actions": [],
    "mode": "仅离线"
  }
] as const;
export function workbenchDesign(path: string, role: string, online: boolean) {
  return workbenchPages.find(p => p.route === path && (p.role === role || p.role === 'shared') && !(online ? p.mode.startsWith('仅离线') : p.mode.startsWith('仅在线'))) ?? workbenchPages.find(p => p.route === '/not-found')!;
}
