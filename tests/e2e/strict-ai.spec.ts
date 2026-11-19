import {test,expect,type Browser} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import sharp from 'sharp';
import {createOnlineApp} from '../../server/app';

test.setTimeout(60000);
async function fixture(browser:Browser,transport:typeof fetch){
 const root=await mkdtemp(join(tmpdir(),'cp-strict-ui-'));
 const app=await createOnlineApp({databasePath:join(root,'db.sqlite'),seed:true,staticRoot:resolve('dist'),ai:{enabled:true,apiKey:'isolated-not-real',dailyGlobalCalls:100,dailyUserCalls:80,transport}});
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
 await app.provision('student001','Strict-UI-only!');await app.listen(0);
 const address=app.server.address();if(!address||typeof address==='string')throw Error('port');
 const origin=`http://127.0.0.1:${address.port}`;
 await page.goto(origin+'/#/login');await page.getByLabel('账号',{exact:true}).fill('student001');await page.getByLabel('密码',{exact:true}).fill('Strict-UI-only!');await page.getByRole('button',{name:'登录',exact:true}).click();
 await expect(page.getByRole('link',{name:'简历工作台',exact:true})).toBeVisible();
 return {page,origin,root,close:async()=>{await context.close();await app.close();await rm(join(root,'db.sqlite'),{force:true});}};
}
function reply(content:unknown){return Response.json({id:'strict-ui-upstream',choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}],usage:{prompt_tokens:20,completion_tokens:30}});}

test('online text interviews use dynamic model questions without automatic speech calls',async({browser})=>{
 let questions=0,speech=0;
 const f=await fixture(browser,async(url,init)=>{
  if(/\/(tts|asr)$/.test(String(url))){speech++;throw Error('text interviews must not request speech automatically');}
  const wire=JSON.parse(String(init?.body)),task=wire.messages[0].content,input=JSON.parse(wire.messages[1].content);
  if(task.includes('INTERVIEW_QUESTION')){questions++;if(questions===2)return new Response('{}',{status:503});return reply({question:questions===1?'请说明一次组件测试经历。':'如何验证上述测试有效？'});}
  if(task.includes('INTERVIEW_EVALUATE'))return reply({dimensions:[{key:'relevance',label:'相关性',score:70,evidence:input.answer.slice(0,6),reason:'提供了测试行动'}],strengths:['行动清晰'],improvements:['补充验证结果']});
  throw Error('unexpected task');
 });
 try{
  await f.page.goto(f.origin+'/#/student/mock');
  await f.page.getByLabel('目标岗位',{exact:true}).fill('组件开发');await f.page.getByLabel('岗位要求与希望考察的能力',{exact:true}).fill('Vue组件与单元测试');
  expect(questions).toBe(0);
  await f.page.getByRole('button',{name:'开始文字面试',exact:true}).click();
  await expect(f.page.getByRole('heading',{name:'请说明一次组件测试经历。',exact:true})).toBeVisible();
  await expect(f.page.getByRole('checkbox',{name:'语音主模式：自动播放问题并开始收音',exact:true})).not.toBeChecked();
  await expect(f.page.locator('.ai-provenance').first()).toContainText('DeepSeek');
  await f.page.setViewportSize({width:390,height:844});expect(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await f.page.screenshot({path:join(f.root,'typed-mobile.png'),fullPage:true});
  await f.page.getByLabel('面试回答与转写').fill('我为组件编写了测试，并运行回归测试。');await f.page.getByRole('button',{name:'确认并提交回答',exact:true}).click();
  await expect(f.page.getByRole('button',{name:'重试下一题',exact:true})).toBeVisible();expect(questions).toBe(2);expect(speech).toBe(0);
  await f.page.getByRole('button',{name:'重试下一题',exact:true}).click();await expect(f.page.getByRole('heading',{name:'如何验证上述测试有效？',exact:true})).toBeVisible();expect(questions).toBe(3);expect(speech).toBe(0);
  f.page.on('dialog',dialog=>void dialog.accept());await f.page.getByRole('button',{name:'结束并查看AI反馈',exact:true}).click();
  await expect(f.page).toHaveURL(/mock\/feedback/);await expect(f.page.getByText('补充验证结果',{exact:true}).first()).toBeVisible();
  await expect(f.page.locator('.ai-provenance').first()).toContainText('上次生成');expect(speech).toBe(0);
  expect(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }finally{await f.close();}
});

test('matching requires consent, shows model order separately from facts, and preserves historical results on failure',async({browser})=>{
 let calls=0,preferredTitle='';let fail=false;
 const f=await fixture(browser,async(_url,init)=>{
  calls++;if(fail)return new Response('{}',{status:503});
  const wire=JSON.parse(String(init?.body)),input=JSON.parse(wire.messages[1].content),candidate=input.candidates.at(-1);preferredTitle=candidate.title;
  return reply({recommendations:[{id:candidate.id,reasons:['模型依据合成经历推荐'],gaps:['请核实完整JD']}]});
 });
 try{
  await f.page.goto(f.origin+'/#/student/jobs/matches');await expect(f.page.getByRole('heading',{name:'找到方向，也看清差距。'})).toBeVisible();expect(calls).toBe(0);
  await f.page.getByRole('switch',{name:'AI默认授权'}).click();await expect(f.page.getByRole('button',{name:'进行AI岗位匹配',exact:true})).toBeDisabled();expect(calls).toBe(0);
  await f.page.getByRole('switch',{name:'AI默认授权'}).click();await f.page.getByRole('button',{name:'进行AI岗位匹配',exact:true}).click();await expect.poll(()=>preferredTitle).not.toBe('');
  await expect(f.page.locator('.job-card').first().getByRole('heading',{level:3})).toHaveText(preferredTitle);
  await expect(f.page.locator('.job-card .job-artwork img').first()).toBeVisible();
  await expect(f.page.locator('.job-card').first()).toContainText('AI推荐顺序 #1');await expect(f.page.locator('.job-card').first()).toContainText('模型依据合成经历推荐');
  await expect(f.page.locator('.job-card').first()).toContainText('规则事实依据');await expect(f.page.locator('.ai-provenance').first()).toContainText('strict-ui-upstream');
  await f.page.setViewportSize({width:390,height:844});expect(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await f.page.screenshot({path:join(f.root,'matching-mobile.png'),fullPage:false});
  await f.page.reload();await expect(f.page.locator('.job-card').first()).toContainText(preferredTitle);expect(calls).toBe(1);await expect(f.page.getByText('上次生成的结果',{exact:true})).toBeVisible();
  fail=true;await f.page.getByRole('button',{name:'进行AI岗位匹配',exact:true}).click();await expect(f.page.getByRole('status')).toContainText('旧结果仍保留');await expect(f.page.locator('.job-card').first()).toContainText(preferredTitle);
 }finally{await f.close();}
});

test('OCR displays provider pages and truncation, clears on consent off, and never invents failed output',async({browser})=>{
 let calls=0,fail=false;
 const f=await fixture(browser,async(url)=>{expect(String(url)).toContain('/tools/ocr');calls++;return fail?Response.json({error:{code:'gateway_timeout_error'}}):Response.json({id:'ocr-ui-upstream',object:'ocr.result',page_count:1,pages:[{index:0,text:'仅用于测试的证书文字',finish_reason:'length'}],usage:{input_tokens:2,output_tokens:3}});});
 try{
  await f.page.goto(f.origin+'/#/student/resume/import');await expect(f.page.getByRole('heading',{name:'将文档识别为可核对的文字。'})).toBeVisible();
  const png=await sharp({create:{width:40,height:20,channels:3,background:'white'}}).png().toBuffer();
  await f.page.getByLabel('选择PDF或图片').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png});expect(calls).toBe(0);
  await f.page.getByRole('button',{name:'发送文档并识别',exact:true}).click();await expect(f.page.getByLabel('第1页识别文字')).toHaveValue('仅用于测试的证书文字');
  await expect(f.page.getByText(/本页达到输出上限/)).toBeVisible();await expect(f.page.locator('.ai-provenance')).toContainText('ocr-ui-upstream');
  await f.page.setViewportSize({width:390,height:844});expect(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await f.page.screenshot({path:join(f.root,'ocr-mobile.png'),fullPage:true});
  await f.page.getByRole('switch',{name:'AI默认授权'}).click();await expect(f.page.getByLabel('第1页识别文字')).toHaveCount(0);await expect(f.page.getByLabel('选择PDF或图片')).toHaveValue('');
  await f.page.getByRole('switch',{name:'AI默认授权'}).click();fail=true;await f.page.getByLabel('选择PDF或图片').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png});await f.page.getByRole('button',{name:'发送文档并识别',exact:true}).click();
  await expect(f.page.getByRole('status')).toContainText('识别未完成');await expect(f.page.getByLabel('第1页识别文字')).toHaveCount(0);expect(calls).toBe(2);
  await f.page.setViewportSize({width:390,height:844});expect(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }finally{await f.close();}
});

test('OCR cancels in-flight work and discards the document when consent is withdrawn or the user leaves',async({browser})=>{
 let calls=0,aborted=0;
 const f=await fixture(browser,async(_url,init)=>{calls++;return new Promise<Response>((_resolve,reject)=>{init?.signal?.addEventListener('abort',()=>{aborted++;reject(Error('cancelled'));},{once:true});});});
 try{
  await f.page.goto(f.origin+'/#/student/resume/import');const png=await sharp({create:{width:40,height:20,channels:3,background:'white'}}).png().toBuffer();
  await f.page.getByLabel('选择PDF或图片').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png});await f.page.getByRole('button',{name:'发送文档并识别',exact:true}).click();await expect.poll(()=>calls).toBe(1);
  await f.page.getByRole('switch',{name:'AI默认授权'}).click();await expect.poll(()=>aborted).toBe(1);await expect(f.page.getByLabel('选择PDF或图片')).toHaveValue('');await expect(f.page.getByLabel('第1页识别文字')).toHaveCount(0);
  await f.page.getByRole('switch',{name:'AI默认授权'}).click();await f.page.getByLabel('选择PDF或图片').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:png});await f.page.getByRole('button',{name:'发送文档并识别',exact:true}).click();await expect.poll(()=>calls).toBe(2);
  await f.page.getByRole('link',{name:'返回简历工作台',exact:true}).click();await expect.poll(()=>aborted).toBe(2);await f.page.goto(f.origin+'/#/student/resume/import');await expect(f.page.getByLabel('选择PDF或图片')).toHaveValue('');await expect(f.page.getByLabel('第1页识别文字')).toHaveCount(0);
 }finally{await f.close();}
});
