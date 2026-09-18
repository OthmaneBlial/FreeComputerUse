export interface Usage { input:number;output:number;cacheHit?:number;cacheMiss?:number;estimated?:boolean }
export interface BudgetLimits {maxLLMCalls:number;maxInputTokens:number;maxOutputTokens:number}
export class TokenBudget {
  calls=0;input=0;output=0;cost:number|null;
  constructor(readonly limits:BudgetLimits={maxLLMCalls:10,maxInputTokens:20000,maxOutputTokens:5000},
    readonly prices?:{input:number;output:number;cachedInput?:number}){this.cost=prices?0:null;}
  get tight(){return this.calls>=this.limits.maxLLMCalls*.7||this.input>=this.limits.maxInputTokens*.7||this.output>=this.limits.maxOutputTokens*.7;}
  reserve(inputBound:number,requestedOutput=1600){
    const maxOutput=Math.min(requestedOutput,this.limits.maxOutputTokens-this.output);
    if(this.calls>=this.limits.maxLLMCalls)throw new Error('LLM call budget exhausted');
    if(this.input+inputBound>this.limits.maxInputTokens)throw new Error('LLM input budget cannot admit this request; narrow context or raise the explicit budget');
    if(maxOutput<100)throw new Error('LLM output budget exhausted');
    this.calls++;
    return maxOutput;
  }
  record(usage:Usage){
    this.input+=usage.input;this.output+=usage.output;
    if(this.prices){
      const cached=usage.cacheHit??0;
      this.cost=(this.cost??0)+((usage.input-cached)*this.prices.input+cached*(this.prices.cachedInput??this.prices.input)+usage.output*this.prices.output)/1e6;
    }
  }
  snapshot(actions=0){return{llmCalls:this.calls,inputTokens:this.input,outputTokens:this.output,estimatedCostUSD:this.cost,actionsPerLLMCall:this.calls?actions/this.calls:null,tokensPerAction:actions?(this.input+this.output)/actions:null};}
}
