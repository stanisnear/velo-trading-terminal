// Public Solidity mapping getters return separate outputs. Viem decodes those
// as an array, unlike getPosition's single named struct output.
const fields = ['owner','pairIndex','isLong','leverage','marginMode','triggerKind',
  'reduceOnly','reduceBps','collateralUSDC_6','triggerPrice_E18','createdAt','active'];
export function normalizeConditionalOrder(value) {
  if (!Array.isArray(value)) return value;
  if (value.length !== fields.length) throw new Error('Invalid conditional-order result');
  return Object.fromEntries(fields.map((name,index) => [name,value[index]]));
}
