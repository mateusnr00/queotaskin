import { randomBytes } from "node:crypto";

// Senha temporária de acesso ao painel.
//
// Quem cria a conta não escolhe a senha. Se escolhesse, ela nasceria
// conhecida por duas pessoas, e a dona da conta não teria como saber disso.
// Aqui a senha é sorteada, aparece uma única vez para ser repassada, e o
// painel exige a troca no primeiro acesso (mustChangePassword), então a que
// trafegou por fora do sistema morre no primeiro login.

// Sem O/0 e l/1/I: essa senha vai ser lida em voz alta ou copiada à mão de
// uma tela para outra, e confundir esses caracteres transforma um acesso
// numa mensagem de senha inválida que ninguém sabe explicar.
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/**
 * 20 caracteres do alfabeto acima dão cerca de 116 bits de entropia, muito
 * além do que o freio de login precisa aguentar. O custo de aumentar é só
 * incômodo para quem digita.
 *
 * `randomBytes`, não `Math.random`: previsível aqui significa conta de
 * painel aberta.
 */
export function gerarSenhaTemporaria(tamanho = 20): string {
  const bytes = randomBytes(tamanho);
  let saida = "";
  for (let i = 0; i < tamanho; i++) {
    saida += ALFABETO[bytes[i]! % ALFABETO.length];
  }
  return saida;
}
