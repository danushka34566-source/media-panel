export const stopCommandItemActivation = (event: {
  key: string
  stopPropagation: () => void
}) => {
  if (event.key === 'Enter') { event.stopPropagation(); }
};
