import {describe,it,expect} from 'vitest';
import {beijingDay,calendarMonth} from '../../src/presentation/interview-calendar';
describe('read-only interview calendar',()=>{
  it('groups UTC invitations by Beijing date across midnight',()=>{
    expect(beijingDay('2026-11-18T16:30:00Z')).toBe('2026-11-19');
    const days=calendarMonth('2026-11-01',[{id:'a',scheduledAt:'2026-11-18T16:30:00Z'}]);
    expect(days.find(d=>d.date==='2026-11-19')?.events.map(e=>e.id)).toEqual(['a']);
    expect(days.find(d=>d.date==='2026-11-18')?.events).toEqual([]);
  });
  it('uses Monday first, handles leap day and excludes other months',()=>{
    const days=calendarMonth('2024-02-20',[{id:'a',scheduledAt:'2024-03-01T00:00:00Z'}]);
    expect(days[0]?.date).toBe('2024-01-29');
    expect(days.filter(d=>d.inMonth)).toHaveLength(29);
    expect(days.find(d=>d.date==='2024-02-29')?.inMonth).toBe(true);
    expect(days.length%7).toBe(0);
    expect(days.filter(d=>d.inMonth).flatMap(d=>d.events)).toEqual([]);
  });
});
