// Read-only projection of already authorized invitations. No scheduling mutations.
export interface CalendarEvent {id:string;scheduledAt:string}
export const beijingDay=(value:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export function calendarMonth<T extends CalendarEvent>(anchor:string,events:readonly T[]){
  const [year,month]=anchor.slice(0,7).split('-').map(Number);
  const first=new Date(Date.UTC(year!,month!-1,1)),offset=(first.getUTCDay()+6)%7;
  const count=new Date(Date.UTC(year!,month!,0)).getUTCDate();
  const grouped=new Map<string,T[]>();
  for(const event of events){const key=beijingDay(event.scheduledAt);grouped.set(key,[...(grouped.get(key)??[]),event]);}
  return Array.from({length:Math.ceil((offset+count)/7)*7},(_,index)=>{
    const value=new Date(Date.UTC(year!,month!-1,index-offset+1)),date=value.toISOString().slice(0,10);
    return {date,day:value.getUTCDate(),inMonth:value.getUTCMonth()===month!-1,events:grouped.get(date)??[]};
  });
}
