import type { Agreement, Application, Destination, Interview, MockSession, Resume } from "../types/entities";
type Input = { interviews: Interview[]; agreements: Agreement[]; destinations: Destination[]; applications: Application[]; mockSessions: MockSession[]; resumes?: Resume[] };
export type StudentTask = { id: string; kind: "resume" | "destination" | "agreement" | "interview" | "offer" | "practice"; title: string; detail: string; to: string };
export function studentTasks(data: Input, now: string): StudentTask[] {
  const tasks: StudentTask[] = [];
  const resume=data.resumes?.[0];
  if(resume&&!resume.sections.education.length)tasks.push({id:resume.id,kind:'resume',title:'完善真实教育经历',detail:'填写本人院校、学历和起止日期并保存后才可投递；岗位浏览与面试模板不受影响。',to:'/student/resume'});
  for (const d of data.destinations) if (d.status === "rejected") tasks.push({ id: d.id, kind: "destination", title: "补充去向材料", detail: d.reviewReason || "请核对审核意见后重新提交。", to: "/student/destination" });
  for (const a of data.agreements) if (a.status === "draft" && a.companyConfirmedAt && !a.studentConfirmedAt) tasks.push({ id: a.id, kind: "agreement", title: "核对就业协议", detail: "企业已确认，请阅读协议后决定是否确认。", to: "/student/destination" });
  const week = Date.parse(now) + 7 * 86400000;
  for (const i of [...data.interviews].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))) if (i.status === "scheduled" && Date.parse(i.scheduledAt) >= Date.parse(now) && Date.parse(i.scheduledAt) <= week) tasks.push({ id: i.id, kind: "interview", title: "准备近期面试", detail: `${new Date(i.scheduledAt).toLocaleString('zh-CN')} · ${i.location}`, to: "/student/applications" });
  for (const a of data.applications) {
    const document = a.offerDocuments?.at(-1);
    if (a.status === 'offered' && !data.agreements.some(g => g.applicationId === a.id && g.status !== 'terminated') &&
      (!document || (document.status === 'pending' && Date.parse(document.responseDeadline) > Date.parse(now))))
      tasks.push({ id: a.id, kind: 'offer', title: document ? '响应录用意向' : '查看录用意向', detail: document ? '请阅读文书条款，在截止前独立作出决定。' : '招聘流程已更新，请核对意向与下一步。', to: `/student/applications?application=${encodeURIComponent(a.id)}` });
  }
  for (const m of data.mockSessions) if (m.state === "paused" || m.state === "inProgress") tasks.push({ id: m.id, kind: "practice", title: "继续面试练习", detail: "上次练习尚未结束，可接着作答。", to: "/student/mock" });
  return tasks;
}
