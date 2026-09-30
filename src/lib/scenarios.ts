export const scenarioLabels = {
  "job-interview": "job interview",
  meeting: "work meetings",
  email: "professional email phrasing",
  "workplace-small-talk": "workplace small talk",
  "project-explanation": "explaining automation projects",
  presentation: "presentations",
  "phone-call": "professional phone calls",
  "customer-support": "customer support",
  "giving-feedback": "giving constructive feedback",
  networking: "professional networking",
} as const;

export type Scenario = keyof typeof scenarioLabels;
