export type MembershipChange = {
  key: number;
  action: 'add' | 'remove';
  ids: string[];
  pointer: boolean;
};
