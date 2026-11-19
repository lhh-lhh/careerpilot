import {test,expect} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createOnlineApp} from '../../server/app';
test.use({launchOptions:{args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}});

test('AI workbench preserves resume drafts, streams chat, matches preferences and saves interview feedback',async({browser})=>{
 test.setTimeout(90000);
 const root=await mkdtemp(join(tmpdir(),'cp-workbench-e2e-'));let tts=0,asr=0;
 const app=await createOnlineApp({databasePath:join(root,'db.sqlite'),seed:true,staticRoot:resolve('dist'),ai:{enabled:true,apiKey:'isolated-not-real',dailyGlobalCalls:100,dailyUserCalls:80,transport:async(url,init)=>{
  if(String(url).endsWith('/tts')){tts++;return new Response(new Uint8Array(24000),{headers:{'Content-Type':'audio/pcm'}});}
  if(String(url).endsWith('/asr')){asr++;const file=(init?.body as FormData).get('file') as File;const bytes=await file.arrayBuffer(),header=new DataView(bytes);expect(header.getUint32(24,true)).toBe(16000);expect(bytes.byteLength).toBeGreaterThan(44);return Response.json({text:'我在课程项目中负责Vue页面，先复现错误，再修改并运行单元测试。',duration_ms:1000});}
  const wire=JSON.parse(String(init?.body));
  if(wire.stream&&wire.messages.at(-1).content==='撤销授权测试')return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"未完成授权测试回复"}}]}\n\n'));init?.signal?.addEventListener('abort',()=>controller.error(Error('cancelled')),{once:true});}}),{headers:{'Content-Type':'text/event-stream'}});
  if(wire.stream)return new Response('data: {"choices":[{"delta":{"content":"先保存简历，再查看岗位匹配依据。"}}]}\n\ndata: {"choices":[{"finish_reason":"stop","delta":{}}]}\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});
  const task=wire.messages[0].content,input=JSON.parse(wire.messages[1].content);
  let output:unknown='依据已提供的经历，建议核实岗位要求并补充验证结果。';
  if(task.includes('RESUME_OPTIMIZE'))output={summary:'调整结构，不增加事实。',patches:input.slice(0,2).map((r:{section:string;rowId:string;text:string},i:number)=>({id:'p'+i,section:r.section,rowId:r.rowId,before:r.text,after:r.text+' 完成上述任务。',reason:'结构清晰',requiresUserInput:false}))};
  if(task.includes('MATCH_RECOMMEND'))output={recommendations:input.candidates.slice(0,3).map((c:{id:string})=>({id:c.id,reasons:['根据已有事实核对方向'],gaps:['核实完整岗位要求']}))};
  if(task.includes('INTERVIEW_QUESTION'))output={question:input.history.length?'请说明你如何验证上述修改？':'请介绍使用Vue解决问题的经历。'};
  if(task.includes('INTERVIEW_EVALUATE'))output={dimensions:[{key:'relevance',label:'相关性',score:70,evidence:input.answer.slice(0,6),reason:'有行动说明'}],strengths:['行动清晰'],improvements:['补充验证结果']};
  return Response.json({choices:[{finish_reason:'stop',message:{content:typeof output==='string'?output:JSON.stringify(output)}}]});
 }}});
 const context=await browser.newContext({viewport:{width:1365,height:900},permissions:['microphone']}),page=await context.newPage(),errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 const actor={userId:'user-student-001',role:'student'} as const;
 try{
  await app.provision('student001','Workbench-E2E-only!');await app.listen(0);
  const address=app.server.address();if(!address||typeof address==='string')throw Error('port');const origin=`http://127.0.0.1:${address.port}`;
  await page.goto(origin+'/#/login');await page.getByLabel('账号',{exact:true}).fill('student001');await page.getByLabel('密码',{exact:true}).fill('Workbench-E2E-only!');await page.getByRole('button',{name:'登录',exact:true}).click();
  await expect(page.getByRole('link',{name:'简历工作台',exact:true})).toBeVisible();
  await page.goto(origin+'/#/student/resume/optimize');await expect(page.getByRole('heading',{name:'把表达打磨好，把选择留给你。'})).toBeVisible();
  const before=(await app.repository.readScopedSnapshot(actor)).resumes[0]!;
  await page.getByRole('button',{name:'生成AI优化方案',exact:true}).click();
  await expect(page.getByRole('button',{name:'一键接受本部分',exact:true})).toHaveCount(2);
  await page.getByRole('button',{name:'一键接受本部分',exact:true}).first().click();
  await expect(page.getByText('已应用到草稿',{exact:true})).toHaveCount(1);
  expect((await app.repository.readScopedSnapshot(actor)).resumes[0]!.revision).toBe(before.revision);
  await page.getByRole('button',{name:'一键接受全部可采纳建议',exact:true}).click();await expect(page.getByText('已应用到草稿',{exact:true})).toHaveCount(2);
  await page.getByRole('button',{name:'撤销上一步',exact:true}).first().click();await expect(page.getByText('已应用到草稿',{exact:true})).toHaveCount(1);
  page.once('dialog',dialog=>void dialog.accept());await page.getByRole('button',{name:'确认并保存到简历',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('已保存为新版本');
  const saved=(await app.repository.readScopedSnapshot(actor)).resumes[0]!;expect(saved.revision).toBe(before.revision+1);expect(saved.versionIds.length).toBe(before.versionIds.length+1);
  await page.getByRole('button',{name:'查看保存版本',exact:true}).click();await expect(page.getByRole('heading',{name:'版本记录',exact:true})).toBeVisible();
  await page.screenshot({path:join(root,'resume-desktop.png'),fullPage:false});
  await page.getByRole('button',{name:'AI Chatbot · 长按拖动',exact:true}).click();const assistant=page.getByRole('dialog',{name:'全局AI助手'});
  await expect(assistant).toBeVisible();await assistant.getByLabel('向AI助手提问').fill('下一步怎样准备？');await assistant.getByRole('button',{name:'发送',exact:true}).click();
  await expect(assistant.getByText('先保存简历，再查看岗位匹配依据。',{exact:true})).toBeVisible();
  await assistant.getByLabel('向AI助手提问').fill('撤销授权测试');await assistant.getByRole('button',{name:'发送',exact:true}).click();await expect(assistant.getByText('未完成授权测试回复',{exact:true})).toBeVisible();await page.getByRole('switch',{name:'AI默认授权'}).click();await expect(assistant.getByRole('button',{name:'停止',exact:true})).toHaveCount(0);await expect(assistant.getByText('未完成授权测试回复',{exact:true})).toHaveCount(0);await expect(assistant.getByRole('button',{name:'发送',exact:true})).toBeDisabled();await page.getByRole('switch',{name:'AI默认授权'}).click();
  await assistant.getByRole('link',{name:'进行AI岗位匹配',exact:true}).click();await expect(page.getByRole('heading',{name:'找到方向，也看清差距。'})).toBeVisible();
  await expect(assistant.getByText('先保存简历，再查看岗位匹配依据。',{exact:true})).toBeVisible();await assistant.getByRole('button',{name:'收起AI助手',exact:true}).click();
  await page.getByLabel('意向岗位',{exact:true}).fill('数据分析');await page.getByLabel('期望月薪最低值（元）').fill('12000');await page.getByLabel('期望月薪最低值（元）').fill('');
  await page.getByRole('button',{name:'进行AI岗位匹配',exact:true}).click();
  await expect(page.locator('.job-card').first().getByRole('heading',{level:3})).toContainText('数据分析');
  await page.locator('.job-card').first().getByRole('button',{name:'AI分析匹配依据',exact:true}).click();await expect(page.locator('.analysis').first()).toContainText('核实岗位要求');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:join(root,'matching-mobile.png'),fullPage:false});
  await page.locator('.job-card').first().getByRole('link',{name:'针对此岗位练习面试',exact:true}).click();
  await expect(page.getByLabel('目标岗位',{exact:true})).toHaveValue(/数据分析/);
  await page.getByRole('checkbox',{name:'语音主模式：自动播放问题并开始收音',exact:true}).uncheck();await page.getByRole('checkbox',{name:'自然轮换：转写后2秒自动提交，可随时纠错暂停',exact:true}).uncheck();
  await page.getByRole('button',{name:'进入语音面试房间',exact:true}).click();await expect(page.getByRole('heading',{name:'请介绍使用Vue解决问题的经历。',exact:true})).toBeVisible();
  await page.getByRole('button',{name:/重播问题/}).click();await expect.poll(()=>tts).toBe(1);
  await page.getByRole('button',{name:'开始语音回答',exact:true}).click();await expect(page.getByText(/录音 1 \/ 120秒/)).toBeVisible();await page.getByRole('button',{name:'我已回答完毕',exact:true}).click();await expect.poll(()=>asr).toBe(1);await expect(page.getByLabel('面试回答与转写')).toHaveValue(/课程项目/);
  await page.getByRole('button',{name:'开始语音回答',exact:true}).click();await expect(page.getByRole('button',{name:'我已回答完毕',exact:true})).toBeVisible();await page.getByRole('switch',{name:'AI默认授权'}).click();await expect(page.getByRole('button',{name:'我已回答完毕',exact:true})).toHaveCount(0);expect(asr).toBe(1);await page.getByRole('switch',{name:'AI默认授权'}).click();
  await page.getByLabel('面试回答与转写').fill('我在课程项目中负责Vue页面，先复现错误，再修改并运行单元测试。');await page.getByRole('button',{name:'确认并提交回答',exact:true}).click();
  await expect(page.getByRole('heading',{name:'请说明你如何验证上述修改？',exact:true})).toBeVisible();
  let confirms=0;const confirm=(dialog:import('@playwright/test').Dialog)=>{confirms++;void dialog.accept();};page.on('dialog',confirm);
  await page.getByRole('button',{name:'结束并查看AI反馈',exact:true}).click();await expect(page).toHaveURL(/voice\/report/);page.off('dialog',confirm);expect(confirms).toBe(1);
  await expect(page.getByText('共1轮已提交回答，1轮取得有效评价；未评分轮次不计为0分。',{exact:true})).toBeVisible();await expect(page.getByText('补充验证结果',{exact:true}).first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:join(root,'report-mobile.png'),fullPage:false});
  expect(errors).toEqual([]);console.log('Workbench synthetic UI screenshots: '+root);
 }finally{await context.close().catch(()=>undefined);await app.close();await rm(join(root,'db.sqlite'),{force:true});}
});
