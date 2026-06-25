export type RuleOperator = 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'in' | 'not_in';

export interface RuleCondition {
  field: string;
  operator: RuleOperator;
  value: unknown;
}

export interface RouteRule {
  id: string;
  name: string;
  description: string;
  conditions: RuleCondition[];
  action: 'allow' | 'deny';
  priority: number;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

export interface RouteContext {
  sourceChain: string;
  destinationChain: string;
  asset: string;
  amount: string;
  senderAddress?: string;
  recipientAddress?: string;
  attributes?: Record<string, unknown>;
}

export interface EligibilityResult {
  eligible: boolean;
  appliedRule?: RouteRule;
  reason: string;
  evaluatedRules: number;
}

export interface RuleEvaluationLog {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  action: 'allow' | 'deny';
}
