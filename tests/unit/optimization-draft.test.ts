import {expect,it} from 'vitest';
import {applyPatches} from '../../src/domain/resume/optimization-draft';
import type {ResumeSections} from '../../src/types/entities';
const source={projects:[{id:'a',description:'原文A'},{id:'b',description:'原文B'}],experience:[]} as unknown as ResumeSections;
it('batch accepts independent fields without mutating source and excludes factual questions',()=>{
 const next=applyPatches(source,[{id:'1',section:'projects',rowId:'a',before:'原文A',after:'改写A',reason:'清晰',requiresUserInput:false},{id:'2',section:'projects',rowId:'b',before:'原文B',after:'改写B',reason:'待补',requiresUserInput:true}]);
 expect(next.projects.map(p=>p.description)).toEqual(['改写A','原文B']);expect(source.projects[0]!.description).toBe('原文A');
});
it('stale original rejects the whole batch rather than leaving partial writes',()=>{
 expect(()=>applyPatches(source,[{id:'1',section:'projects',rowId:'a',before:'过期',after:'覆盖',reason:'',requiresUserInput:false}])).toThrow('STALE');
 expect(source.projects[0]!.description).toBe('原文A');
});
