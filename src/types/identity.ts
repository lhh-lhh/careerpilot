export type Role = "student" | "company" | "counselor" | "admin";
export interface Actor {
  userId: string;
  role: Role;
}
export const roles: readonly Role[] = [
  "student",
  "company",
  "counselor",
  "admin",
];
export const roleLabels: Record<Role, string> = {
  student: "学生",
  company: "企业",
  counselor: "辅导员",
  admin: "管理员",
};
export const demoActors: Record<Role, Actor> = {
  student: { userId: "user-student-001", role: "student" },
  company: { userId: "user-company-001", role: "company" },
  counselor: { userId: "user-counselor-001", role: "counselor" },
  admin: { userId: "user-admin-001", role: "admin" },
};
export const roleHome: Record<Role, string> = {
  student: "/student",
  company: "/company",
  counselor: "/counselor",
  admin: "/admin",
};
