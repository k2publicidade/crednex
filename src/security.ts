export const MIN_PASSWORD_LENGTH=8
export function validPassword(value:unknown):value is string {
  return typeof value==='string'&&value.length>=MIN_PASSWORD_LENGTH&&value.length<=128
}
