export interface Usage { input:number;output:number;cacheHit?:number;cacheMiss?:number;estimated?:boolean }
export interface BudgetLimits {maxLLMCalls:number|null;maxInputTokens:number|null;maxOutputTokens:number|null}
export interface Reservation {id:number;maxOutput:number;inputBound:number}
export class TokenBudget {
  calls=0;input=0;output=0;cost:number|null;
  private reservations=new Map<number,Reservation>();
  constructor(readonly limits:BudgetLimits={maxLLMCalls:null,maxInputTokens:null,maxOutputTokens:null},
    readonly prices?:{input:number;output:number;cachedInput?:number}){this.cost=prices?0:null;}
  get tight(){return (this.limits.maxLLMCalls!==null&&this.calls>=this.limits.maxLLMCalls*.7)||(this.limits.maxInputTokens!==null&&this.input+this.pendingInput>=this.limits.maxInputTokens*.7)||(this.limits.maxOutputTokens!==null&&this.output+this.pendingOutput>=this.limits.maxOutputTokens*.7);}
  get pendingInput(){return [...this.reservations.values()].reduce((n,r)=>n+r.inputBound,0);}
  get pendingOutput(){return [...this.reservations.values()].reduce((n,r)=>n+r.maxOutput,0);}
  reserve(inputBound:number,requestedOutput=1600){
    if(!Number.isSafeInteger(inputBound)||inputBound<0||!Number.isSafeInteger(requestedOutput)||requestedOutput<100)throw new Error('Invalid token reservation');
    const maxOutput=this.limits.maxOutputTokens===null?requestedOutput:Math.min(requestedOutput,this.limits.maxOutputTokens-this.output-this.pendingOutput);
    if(this.limits.maxLLMCalls!==null&&this.calls>=this.limits.maxLLMCalls)throw new Error('LLM call budget exhausted');
    if(this.limits.maxInputTokens!==null&&this.input+this.pendingInput+inputBound>this.limits.maxInputTokens)throw new Error('LLM input budget cannot admit this request; narrow context or raise the explicit budget');
    if(maxOutput<100)throw new Error('LLM output budget exhausted');
    this.calls++;
    const reservation={id:this.calls,maxOutput,inputBound};this.reservations.set(reservation.id,reservation);return reservation;
  }
  record(usage:Usage,reservationId?:number){
    if(!Number.isSafeInteger(usage.input)||usage.input<0||!Number.isSafeInteger(usage.output)||usage.output<0||usage.cacheHit!==undefined&&(usage.cacheHit<0||usage.cacheHit>usage.input))throw new Error('Invalid provider token usage');
    const id=reservationId??this.reservations.keys().next().value;
    if(id!==undefined)this.reservations.delete(id);
    this.input+=usage.input;this.output+=usage.output;
    if(this.prices){
      const cached=usage.cacheHit??0;
      this.cost=(this.cost??0)+((usage.input-cached)*this.prices.input+cached*(this.prices.cachedInput??this.prices.input)+usage.output*this.prices.output)/1e6;
    }
  }
  snapshot(actions=0){return{llmCalls:this.calls,inputTokens:this.input,outputTokens:this.output,estimatedCostUSD:this.cost,actionsPerLLMCall:this.calls?actions/this.calls:null,tokensPerAction:actions?(this.input+this.output)/actions:null};}
}
