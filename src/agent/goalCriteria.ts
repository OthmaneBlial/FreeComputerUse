import type {Condition} from '../actions/schema.js';
export function goalCriteria(goal:string):Condition[]{
  const criteria:Condition[]=[];
  const mentionsDownload=/\b(download|export)\b/i.test(goal);
  const informational=/\b(?:how|where|when|why|what|whether|should I|can I|could I)\b.{0,40}\b(?:download|export)(?:ing)?\b/i.test(goal);
  const prohibited=/\b(?:don['’]t|do not|never|avoid|without)\b.{0,40}\b(?:download|export)(?:ing)?\b/i.test(goal);
  const locating=/\b(?:find|locate|show me|identify)\b.{0,32}\b(?:download|export)\s+(?:link|button|option|menu|section|page)\b/i.test(goal);
  if(mentionsDownload&&!informational&&!prohibited&&!locating)criteria.push({type:'download_created'});
  if(/\b(extract|list|read|tell me|give me|find the cheapest|find the relevant information)\b/i.test(goal)){
    criteria.push({type:'extraction_created'});
    const count=goal.match(/\b(?:first|top)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i)?.[1]?.toLowerCase();
    const words:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
    const amount=count?(words[count]??Number(count)):0;
    if(amount>0&&amount<=1000)criteria.push({type:'extraction_count',min:amount,max:amount});
  }
  return criteria;
}
