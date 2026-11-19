import { open, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setupPilot } from '../server/pilot';

const credentialsPath=resolve('server-data/initial-credentials.json'),pilotPath=resolve('server-data/pilot-credentials.json');
const credentials=JSON.parse(await readFile(credentialsPath,'utf8')) as {login:string;password:string}[];
try {const existing=JSON.parse(await readFile(pilotPath,'utf8'));if(Array.isArray(existing))credentials.push(...existing);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
const result=await setupPilot({origin:process.env.CAREERPILOT_ORIGIN??'http://127.0.0.1:4174',credentials,saveCredential:async value=>{
  const handle=await open(pilotPath,'wx',0o600);try{await handle.writeFile(JSON.stringify([value],null,2));}finally{await handle.close();}
}});
console.log(JSON.stringify({...result,credentialFile:pilotPath},null,2));
