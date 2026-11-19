import {expect,it} from 'vitest';
import {aiConsent,setAiConsent} from '../../src/services/ai-consent';
import {watch} from 'vue';
it('AI starts enabled but explicit shutdown synchronously notifies consumers and blocks further calls until reenabled',()=>{
 expect(aiConsent.value).toBe(true);let stopped=0;const end=watch(aiConsent,value=>{if(!value)stopped++;},{flush:'sync'});
 setAiConsent(false);expect(aiConsent.value).toBe(false);expect(stopped).toBe(1);setAiConsent(true);expect(aiConsent.value).toBe(true);end();
});
