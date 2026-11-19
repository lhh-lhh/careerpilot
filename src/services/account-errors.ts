import { DomainError } from '../domain/errors';
export function accountError(error: unknown) {
  const code = error instanceof DomainError ? error.code : '';
  return ({ALREADY_EXISTS:'账号或学号已存在，请核对后重试。',CONFLICT:'账号或学号已存在，请核对后重试。',REVISION_CONFLICT:'信息已更新，请刷新后重新确认。',BAD_REQUEST:'请核对必填信息及密码要求。',FORBIDDEN:'无权执行此操作，或邀请已失效。',RATE_LIMITED:'操作过于频繁，请稍后再试。',CSRF_INVALID:'会话校验失败，请刷新后重试。'} as Record<string,string>)[code] ?? '暂时无法完成操作，请稍后重试。';
}
