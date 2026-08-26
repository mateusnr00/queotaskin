// Helpers para CPF, armazenamos SOMENTE dígitos no banco.
// Formatação fica para a camada de UI.

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatCpf(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length !== 11) return digits;
  return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

// Validação completa de CPF (algoritmo dos dígitos verificadores).
// Não basta checar tamanho: precisamos rejeitar CPFs inválidos como "111.111.111-11".
export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false; // todos dígitos iguais

  const calcDigit = (length: number): number => {
    let sum = 0;
    for (let i = 0; i < length; i++) {
      sum += parseInt(cpf[i]!, 10) * (length + 1 - i);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  return (
    calcDigit(9) === parseInt(cpf[9]!, 10) &&
    calcDigit(10) === parseInt(cpf[10]!, 10)
  );
}

export function formatPhone(value: string): string {
  const digits = onlyDigits(value);
  if (digits.length === 11) {
    return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  }
  if (digits.length === 10) {
    return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  }
  return digits;
}
