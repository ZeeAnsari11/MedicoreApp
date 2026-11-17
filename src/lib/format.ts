/** Display only: all amounts are computed by the backend. */
export const formatRs = (n: number) => `Rs ${n.toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
export const formatInt = (n: number) => n.toLocaleString('en-PK');
