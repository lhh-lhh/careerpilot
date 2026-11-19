import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { workbenchDesign, workbenchPages } from '../../src/presentation/workbench-design';

describe('approved workbench presentation selection', () => {
  it('selects role-specific account imagery without borrowing another identity', () => {
    expect(workbenchDesign('/account', 'student', true).id).toBe('S22');
    expect(workbenchDesign('/account', 'company', true).id).toBe('C08');
    expect(workbenchDesign('/account', 'counselor', true).id).toBe('T07');
    expect(workbenchDesign('/account', 'admin', true).id).toBe('A07');
    expect(workbenchDesign('/account', 'shared', true).id).toBe('X02');
  });
  it('keeps online and offline same-route screens distinct', () => {
    expect(workbenchDesign('/student/mock', 'student', true).id).toBe('S10');
    expect(workbenchDesign('/student/mock', 'student', false).id).toBe('S14');
    expect(workbenchDesign('/admin', 'admin', true).id).toBe('A01');
    expect(workbenchDesign('/admin', 'admin', false).id).toBe('A08');
  });
  it('never resolves a role-protected or unavailable design for the wrong context', () => {
    expect(workbenchDesign('/admin/accounts', 'student', true).id).toBe('X02');
    expect(workbenchDesign('/student/data-check', 'student', true).id).toBe('X02');
    expect(workbenchDesign('/student/service', 'student', false).id).toBe('X02');
    expect(workbenchDesign('/company/overview', 'company', true).id).toBe('C09');
    expect(workbenchDesign('/forbidden', 'student', true).id).toBe('X01');
  });
  it('has a loadable approved asset for every page and role variant', () => {
    expect(workbenchPages).toHaveLength(49);
    expect(new Set(workbenchPages.map(page => page.id)).size).toBe(49);
    for (const page of workbenchPages) expect(existsSync(`public/media/workbench/${page.art}.webp`), page.id).toBe(true);
  });
});
