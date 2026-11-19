import { createHash } from 'node:crypto';
import type { createSqlDatabase } from '../database';
export function createWorkbenchRecords(database:ReturnType<typeof createSqlDatabase>){
  const {sql}=database;
  sql.exec('CREATE TABLE IF NOT EXISTS workbench_records(user_id TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)),PRIMARY KEY(user_id,kind,id))');
  function list<T>(userId:string,kind:string):T[]{return sql.prepare('SELECT data FROM workbench_records WHERE user_id=? AND kind=? ORDER BY rowid DESC LIMIT 50').all(userId,kind).map(r=>JSON.parse(String(r.data)));}
  function get<T>(userId:string,kind:string,id:string):T{const row=sql.prepare('SELECT data FROM workbench_records WHERE user_id=? AND kind=? AND id=?').get(userId,kind,id);if(!row)throw Error('NOT_FOUND');return JSON.parse(String(row.data));}
  function put(userId:string,kind:string,value:{id:string}){sql.prepare('INSERT INTO workbench_records VALUES(?,?,?,?) ON CONFLICT(user_id,kind,id) DO UPDATE SET data=excluded.data').run(userId,kind,value.id,JSON.stringify(value));}
  function remove(userId:string,kind:string,id:string){get(userId,kind,id);sql.prepare('DELETE FROM workbench_records WHERE user_id=? AND kind=? AND id=?').run(userId,kind,id);}
  function audit(userId:string,operation:string){sql.prepare('INSERT INTO changes(user_id,created_at) VALUES(?,?)').run(userId,new Date().toISOString());return createHash('sha256').update(`${userId}:${operation}:${Date.now()}`).digest('hex').slice(0,20);}
  return {list,get,put,remove,audit};
}
