import copy
import hashlib
import json
import math
import re
import unicodedata
from pathlib import Path
import rfc8785
from jsonschema import Draft202012Validator, FormatChecker
from .errors import GatewayError

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = json.loads((ROOT/"src/contracts/ai-contracts.schema.json").read_text(encoding="utf-8"))
VARIABLES = json.loads((ROOT/"src/contracts/ai-variables.schema.json").read_text(encoding="utf-8"))
OPERATIONS = {"A1":["rewrite"],"A2":["question","followUp","feedback"],"A3":["explain"],"A7":["query","advice"]}
FINGERPRINT_FIELDS = ["module","operation","promptVersion","schemaVersion","algorithmVersion","domainRevision","variables"]
WIRE_FIELDS = set(FINGERPRINT_FIELDS + ["gatewayVersion","traceId","inputHash"])
CONTACT = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)|(?<!\d)\d{17}[\dXx](?!\d)|https?://|file://|data:|blob:",re.I)
NUMBERS = re.compile(r"\d+(?:\.\d+)?",re.ASCII)

def require(ok, code="SEMANTIC_INVALID"):
    if not ok: raise GatewayError(code,502 if code!="INPUT_BLOCKED" else 400)

def normalize(value, key=""):
    if value is None or isinstance(value,bool): return value
    if isinstance(value,(float,int)):
        require(math.isfinite(value),"INPUT_BLOCKED")
        if isinstance(value,int) and abs(value)>9007199254740991:
            # JSON.parse in the browser uses binary64 even for an integer token.
            return float(value)
        return 0 if value==0 else value
    if isinstance(value,str):
        require(not any(0xD800<=ord(c)<=0xDFFF for c in value),"INPUT_BLOCKED")
        return unicodedata.normalize("NFC",value.replace("\r\n","\n").replace("\r","\n"))
    if isinstance(value,list):
        array=[normalize(v) for v in value]
        if key=="skillIds" or key.endswith("SkillIds"):
            require(all(isinstance(v,str) for v in array),"INPUT_BLOCKED")
            return sorted(set(array),key=lambda v:v.encode("utf-16-be"))
        return array
    require(isinstance(value,dict),"INPUT_BLOCKED")
    result={}
    for raw,item in value.items():
        name=normalize(raw)
        require(name not in {"__proto__","constructor","prototype"} and name not in result,"INPUT_BLOCKED")
        result[name]=normalize(item,name)
    return result

def canonical_json(value):
    try: return rfc8785.dumps(normalize(value)).decode("utf-8")
    except (ValueError,OverflowError,UnicodeError): raise GatewayError("INPUT_BLOCKED") from None

def validate_wire(value):
    require(isinstance(value,dict) and set(value)==WIRE_FIELDS,"INPUT_BLOCKED")
    require(isinstance(value["module"],str) and isinstance(value["operation"],str) and
            value["module"] in OPERATIONS and value["operation"] in OPERATIONS[value["module"]],"INPUT_BLOCKED")
    require(all(value[k]=="1.0" for k in ["gatewayVersion","promptVersion","schemaVersion","algorithmVersion"]),"INPUT_BLOCKED")
    require(isinstance(value["traceId"],str) and re.fullmatch(r"[A-Za-z0-9_.-]{1,100}",value["traceId"]),"INPUT_BLOCKED")
    require(all(isinstance(value[k],str) and re.fullmatch(r"[a-f0-9]{64}",value[k]) for k in ["inputHash","domainRevision"]),"INPUT_BLOCKED")
    v=value["variables"]
    require(not list(Draft202012Validator(VARIABLES[value["module"]],format_checker=FormatChecker()).iter_errors(v)),"INPUT_BLOCKED")
    serialized=canonical_json(v)
    require(len(serialized)<=12000 and not CONTACT.search(serialized),"INPUT_BLOCKED")
    expected=hashlib.sha256(canonical_json({key:value[key] for key in FINGERPRINT_FIELDS}).encode()).hexdigest()
    require(value["inputHash"]==expected,"INPUT_BLOCKED")
    module=value["module"]
    if module=="A1":
        require(len({f["fieldPath"] for f in v["fields"]})==len(v["fields"]) and all(not re.search(r"__proto__|constructor|prototype",f["fieldPath"]) for f in v["fields"]),"INPUT_BLOCKED")
    elif module=="A2": require(len({a["id"] for a in v["answers"]})==len(v["answers"]),"INPUT_BLOCKED")
    elif module=="A3": require(v["job"]["jobId"]==v["match"]["jobId"] and len({d["key"] for d in v["match"]["dimensions"]})==6,"INPUT_BLOCKED")
    elif module=="A7":
        require(len({m["token"] for m in v["metricContext"]})==len(v["metricContext"]) and
                all(re.fullmatch(r"\{\{metric:"+re.escape(m["metricId"])+r"(?::[A-Za-z0-9_-]{1,64})?\}\}",m["token"]) for m in v["metricContext"]),"INPUT_BLOCKED")
        require(len(v["targetStudents"])==(0 if value["operation"]=="query" else 1),"INPUT_BLOCKED")
    return value

def plain(text):
    require(not CONTACT.search(text) and not re.search(r"</?[a-z][^>]*>|javascript:",text,re.I))

def evidence_valid(evidence,sources):
    text=sources.get(evidence["fieldPath"])
    require(text is not None)
    encoded=text.encode("utf-16-le")
    start,end=evidence["start"],evidence["end"]
    require(0<=start<end<=len(encoded)//2)
    try: quote=encoded[start*2:end*2].decode("utf-16-le")
    except UnicodeError: raise GatewayError("SEMANTIC_INVALID",502) from None
    require(quote==evidence["quote"])

def factual_change(before,after):
    numbers=set(NUMBERS.findall(before));words=set(re.findall(r"[A-Za-z][A-Za-z0-9.+#-]*",before))
    chars=set(before+"在该任务中我负责通过并与以及最终从而实现完成参与使用进行针对把将为的了和；：，。！？、（）()[]【】 \n")
    return (any(n not in numbers for n in NUMBERS.findall(after)) or
            any(w not in words for w in re.findall(r"[A-Za-z][A-Za-z0-9.+#-]*",after)) or
            any(("\u3400"<=c<="\u9fff" or 0x20000<=ord(c)<=0x323AF) and c not in chars for c in after) or
            any(term in after and term not in before for term in ["主导","独立","领导","精通","显著","成功"]))

def numeric_text(text,allowed):
    used=re.findall(r"\{\{[^{}]*\}\}",text)
    require(all(t in allowed for t in used))
    rest=re.sub(r"\{\{[^{}]*\}\}","",text)
    require(not re.search(r"[0-9０-９{}]|百分之|[零一二三四五六七八九十百千万亿两]+(?:分|个|人|次|成|位|倍|％|%)",rest))

def guard_payload(wire,payload):
    module,operation=wire["module"],wire["operation"]
    schema={"$ref":f"#/$defs/{module}","$defs":CONTRACT["$defs"]}
    require(not list(Draft202012Validator(schema).iter_errors(payload)),"SCHEMA_INVALID")
    require(payload["operation"]==operation)
    data=copy.deepcopy(payload);v=wire["variables"]
    if module=="A1":
        plain(data["summary"])
        require(len({s["id"] for s in data["suggestions"]})==len(data["suggestions"]))
        sources={f["fieldPath"]:f["text"] for f in v["fields"]}
        for s in data["suggestions"]:
            require(re.fullmatch(r"(?:experience|projects)\.[A-Za-z0-9_-]+\.description",s["fieldPath"]) and not re.search(r"__proto__|constructor|prototype",s["fieldPath"]))
            require(sources.get(s["fieldPath"])==s["before"] and v["resumeVersionId"]==s["resumeVersionId"])
            for e in s["evidence"]:
                require(e["fieldPath"]==s["fieldPath"]);evidence_valid(e,sources)
            plain(s["after"]);plain(s["reason"])
            if factual_change(s["before"],s["after"]) or any(not any(n in e["quote"] for e in s["evidence"]) for n in NUMBERS.findall(s["after"])):
                s["after"]="【待核实：请依据真实经历补充表达】";s["requiresUserInput"]=True
            if "【" in s["after"] or re.search(r"\[[^\]]*(?:待|请|填写)",s["after"]):s["requiresUserInput"]=True
    elif module=="A2":
        require(data["sessionId"]==v["sessionId"] and data["questionId"]==v["question"]["questionId"])
        require(operation!="question" or not v["answers"])
        require(operation!="followUp" or (v["followUpCount"]<2 and any(a["kind"]!="skip" and a["text"].strip() for a in v["answers"])))
        for e in data["evidence"]:evidence_valid(e,{f"answers.{a['id']}.text":a["text"] for a in v["answers"]})
        supported=v["question"]["text"] if operation=="question" else "\n".join(a["text"] for a in v["answers"])
        require(all(n in supported for n in NUMBERS.findall(data["text"])));plain(data["text"])
    elif module=="A3":
        require(data["jobId"]==v["job"]["jobId"]==v["match"]["jobId"])
        require(set(data["dimensionKeys"])<={d["key"] for d in v["match"]["dimensions"]})
        require(set(data["skillIds"])<={s for d in v["match"]["dimensions"] for s in d["hits"]+d["misses"]})
        numeric_text(data["text"],{"{{match:total}}"}|{f"{{{{dimension:{key}}}}}" for key in data["dimensionKeys"]});plain(data["text"])
    else:
        require(data["intent"]==v["intent"] and set(data["studentIds"])<={s["studentId"] for s in v["targetStudents"]})
        require((operation=="query" and not data["studentIds"] and not v["targetStudents"]) or (operation=="advice" and len(data["studentIds"])==len(v["targetStudents"])==1))
        require(set(data["ruleIds"])<={r for s in v["targetStudents"] for r in s["ruleIds"]})
        require(set(data["metricRefs"])<={m["metricId"] for m in v["metricContext"]})
        allowed={m["token"] for m in v["metricContext"] if m["metricId"] in data["metricRefs"]}|{f"{{{{rule:{rule}}}}}" for rule in data["ruleIds"]}
        numeric_text(data["text"],allowed);plain(data["text"])
    return data
