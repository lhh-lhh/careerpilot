import type { ResumeSections } from "../../types/entities";
const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function canExportResume(sections: ResumeSections) {
  return (
    !!sections.basic.name.trim() &&
    sections.education.length > 0 &&
    sections.education.every(
      (e) => !!e.school.trim() && !!e.majorId && !!e.degree && !!e.startDate,
    )
  );
}
const degree: Record<string, string> = {
  secondary: "中职",
  associate: "专科",
  bachelor: "本科",
  master: "硕士",
  doctor: "博士",
};
const width = (value: string) =>
  [...value].reduce(
    (n, c) => n + (c.codePointAt(0)! > 255 ? 1 : /[MW@]/.test(c) ? 0.95 : 0.6),
    0,
  );
function wrap(value: string, limit: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    let line = "";
    for (const char of paragraph) {
      if (width(line + char) > limit) {
        lines.push(line);
        line = "";
      }
      line += char;
    }
    lines.push(line);
  }
  return lines;
}
/** One source of layout for student preview, the immutable employer snapshot, and PDF. No HTML or remote assets. */
export function renderResumePages(
  sections: ResumeSections,
  label: (id: string) => string,
  targetTitle = "",
): string[] {
  const pages: string[] = [];
  let main = "",
    y = 62;
  const supplement: { title: string; value: string }[] = [];
  const compact = (
    title: string,
    value: string,
    limit: number,
    max: number,
  ) => {
    const rows = wrap(value, limit);
    if (rows.length <= max) return rows;
    supplement.push({ title, value });
    return [...rows.slice(0, max - 1), "完整内容见补充信息"];
  };
  const nameLines = compact("姓名", sections.basic.name || "姓名待完善", 6, 2);
  const basicItems = [
    sections.basic.email || "邮箱未填写",
    sections.basic.majorId ? label(sections.basic.majorId) : "专业未填写",
    degree[sections.basic.degree ?? ""] ?? "学历未填写",
  ];
  const intentItems = [
    targetTitle || "目标岗位未指定",
    sections.intent.cityIds.length
      ? sections.intent.cityIds.map(label).join(" / ")
      : "意向城市未填写",
    sections.intent.expectedSalary
      ? `期望月薪 ${sections.intent.expectedSalary.min}-${sections.intent.expectedSalary.max}元`
      : "期望薪资未填写",
  ];
  const basicLines = basicItems.flatMap((item, i) =>
    compact(["邮箱", "专业", "学历"][i]!, item, 14, 3),
  );
  const intentLines = intentItems.flatMap((item, i) =>
    compact(["目标岗位", "意向城市", "期望薪资"][i]!, item, 14, 3),
  );
  const text = (
    value: string,
    x: number,
    top: number,
    size = 13,
    color = "#515866",
    bold = false,
  ) =>
    `<text x="${x}" y="${top}" font-size="${size}" fill="${color}"${bold ? ' font-weight="700"' : ""}>${esc(value)}</text>`;
  const sidebar = (page: number) => {
    let s = '<rect width="234" height="1123" fill="#edf0ff"/>';
    s +=
      '<circle cx="117" cy="108" r="45" fill="#d9e0ff"/>' +
      text(
        sections.basic.name.trim().slice(0, 1) || "简",
        96,
        123,
        40,
        "#3454df",
        true,
      );
    nameLines.forEach((line, i) => {
      s += text(
        line,
        30,
        204 + i * 34,
        line === "完整内容见补充信息" ? 12 : 28,
        "#28334b",
        true,
      );
    });
    let top = 290;
    const block = (title: string, items: string[]) => {
      s +=
        `<rect x="0" y="${top - 23}" width="234" height="33" fill="#d6defc"/>` +
        text(title, 28, top, 17, "#3153df", true);
      top += 40;
      for (const line of items) {
        s += text(line, 28, top, 12);
        top += 23;
      }
      top += 35;
    };
    block("基本信息", basicLines);
    block("求职意向", intentLines);
    s +=
      text("个人简历", 28, 1060, 12, "#6b75a0") +
      text(`${page} / PAGE`, 28, 1085, 11, "#6b75a0");
    return s;
  };
  const finish = () => {
    pages.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123" viewBox="0 0 794 1123" role="img" aria-label="精致简历第${pages.length + 1}页"><rect width="794" height="1123" fill="#ffffff"/><g font-family="Microsoft YaHei, PingFang SC, Arial, sans-serif">${sidebar(pages.length + 1)}${main}</g></svg>`,
    );
    main = "";
    y = 62;
  };
  const ensure = (height: number) => {
    if (y + height > 1060) finish();
  };
  const heading = (title: string, icon: string) => {
    ensure(150);
    main +=
      `<circle cx="279" cy="${y - 6}" r="15" fill="#3454e9"/>` +
      text(icon, 272, y, 16, "#ffffff", true) +
      text(title, 304, y, 20, "#3153df", true) +
      `<line x1="${310 + title.length * 21}" y1="${y - 6}" x2="756" y2="${y - 6}" stroke="#d9dffe"/>`;
    y += 40;
  };
  const lines = (
    value: string,
    options: { bold?: boolean; color?: string; size?: number } = {},
  ) => {
    for (const line of wrap(value, options.size === 15 ? 31 : 36)) {
      ensure(24);
      main += text(
        line,
        269,
        y,
        options.size ?? 13,
        options.color ?? "#515866",
        options.bold,
      );
      y += 24;
    }
  };
  const date = (start: string, end: string | null) =>
    `${start} - ${end || "至今"}`;
  heading("教育经历", "学");
  if (!sections.education.length) lines("尚未填写教育经历");
  for (const row of sections.education) {
    ensure(90);
    lines(row.school, { bold: true, color: "#3153df", size: 15 });
    lines(date(row.startDate, row.endDate));
    lines(`${label(row.majorId)} | ${degree[row.degree] ?? label(row.degree)}`);
    y += 16;
  }
  if (sections.experience.length) {
    heading("工作 / 实习经历", "职");
    for (const row of sections.experience) {
      ensure(90);
      lines(row.company, { bold: true, color: "#3153df", size: 15 });
      lines(`${date(row.startDate, row.endDate)} | ${row.title}`);
      lines(row.description);
      y += 20;
    }
  }
  if (sections.projects.length) {
    heading("项目经历", "项");
    for (const row of sections.projects) {
      ensure(90);
      lines(row.name, { bold: true, color: "#3153df", size: 15 });
      lines(`${date(row.startDate, row.endDate)} | ${row.role}`);
      lines(row.description);
      y += 20;
    }
  }
  if (sections.skills.length) {
    heading("相关技能", "技");
    lines(sections.skills.map((s) => label(s.skillId)).join(" · "));
    y += 24;
  }
  if (sections.certificates.length) {
    heading("荣誉证书", "证");
    for (const row of sections.certificates) {
      ensure(80);
      lines(row.name, { bold: true, color: "#3153df", size: 15 });
      lines(`${row.issuer} | ${row.awardedAt}`);
      if (row.description) lines(row.description);
      y += 20;
    }
  }
  if (supplement.length) {
    heading("补充信息", "附");
    for (const item of supplement) {
      ensure(72);
      lines(item.title, { bold: true, color: "#3153df", size: 15 });
      lines(item.value);
      y += 20;
    }
  }
  finish();
  return pages;
}
