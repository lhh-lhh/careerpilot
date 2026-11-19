/** Read-only business-data consistency check; never logs private rows. */
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const paths=process.argv.slice(2);if(paths.length!==2)throw Error('Expected current database and backup database');
const tables=['users','students','companies','resumes','resumeVersions','applications','jobs','interviews','offers','agreements','destinations','attachments','assistance'];
function inspect(path:string){const sql=new DatabaseSync(resolve(path),{readOnly:true});try{const integrity=sql.prepare('PRAGMA quick_check').get()?.quick_check;const present=new Set(sql.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>String(r.name)));return {integrity,tables:tables.filter(t=>present.has(t)).map(table=>{const rows=sql.prepare(`SELECT id,data FROM "${table}" ORDER BY id`).all();return {table,count:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};})};}finally{sql.close();}}
const current=inspect(paths[0]!),backup=inspect(paths[1]!);const unchanged=JSON.stringify(current)===JSON.stringify(backup)&&current.integrity==='ok';console.log(JSON.stringify({unchanged,current,backup},null,2));process.exitCode=unchanged?0:1;
