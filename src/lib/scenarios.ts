export const difficultyLevels = ["A1", "A2", "B1", "B2", "C1"] as const;
export type Difficulty = typeof difficultyLevels[number];

export type Mission = {
  id: string;
  title: string;
  situation: string;
  aiRole: string;
  learnerRole: string;
  defaultLevel: Difficulty;
  objectives: string[];
  complications: Partial<Record<Difficulty, string>>;
  tags: string[];
};

export const missions: Mission[] = [
  { id: "apartment-viewing", title: "Apartment viewing", situation: "View an apartment and decide what to ask before applying.", aiRole: "landlord or letting agent", learnerRole: "prospective tenant", defaultLevel: "B1", objectives: ["Ask about the monthly rent.", "Ask whether heating costs are included.", "Ask about the deposit.", "Arrange the next step."], complications: { A2: "The viewing time must change.", B1: "Heating costs are billed separately.", B2: "Several applicants are interested.", C1: "The contract has an unusual notice period." }, tags: ["housing", "rent", "appointment"] },
  { id: "doctor-appointment", title: "Doctor's appointment", situation: "Call a medical practice to arrange an appointment.", aiRole: "receptionist", learnerRole: "patient", defaultLevel: "A2", objectives: ["Explain why an appointment is needed without unnecessary private detail.", "Ask for an available time.", "Confirm the date and time.", "Ask what to bring."], complications: { B1: "The first available time conflicts with your schedule.", B2: "The receptionist offers a telephone appointment.", C1: "The practice needs a referral." }, tags: ["health", "appointment", "time"] },
  { id: "job-interview", title: "Job interview", situation: "Interview for a role that fits your experience.", aiRole: "interviewer", learnerRole: "candidate", defaultLevel: "B1", objectives: ["Introduce your experience.", "Give a concrete example of a strength.", "Ask a question about the role.", "Discuss availability or next steps."], complications: { B2: "The interviewer asks about a challenging project.", C1: "The interviewer asks you to address a gap in experience." }, tags: ["work", "interview", "experience"] },
  { id: "returning-purchase", title: "Returning a purchase", situation: "Return an item to a shop and resolve the issue politely.", aiRole: "shop assistant", learnerRole: "customer", defaultLevel: "A2", objectives: ["Say what you bought and what went wrong.", "Ask about a return or exchange.", "Answer a question about the receipt.", "Confirm the agreed solution."], complications: { B1: "The receipt is missing.", B2: "The store offers only store credit.", C1: "The policy is ambiguous." }, tags: ["shopping", "return", "receipt"] },
  { id: "meeting-someone", title: "Meeting someone new", situation: "Meet a new person at a local event.", aiRole: "another guest", learnerRole: "new acquaintance", defaultLevel: "A1", objectives: ["Introduce yourself.", "Ask the other person's name.", "Exchange a few details about interests or work.", "Suggest a natural way to continue or end the conversation."], complications: { B1: "The other person speaks quickly about an unfamiliar hobby.", B2: "You discover a shared interest and plan to meet again.", C1: "The conversation shifts to a nuanced local topic." }, tags: ["social", "introductions", "interests"] },
];

export const missionById = Object.fromEntries(missions.map((mission) => [mission.id, mission])) as Record<string, Mission>;
export type Scenario = string;
export const scenarioLabels = Object.fromEntries(missions.map((mission) => [mission.id, mission.title])) as Record<string, string>;
