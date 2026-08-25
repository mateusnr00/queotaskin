// Erros de domínio — usar em vez de `throw new Error("string")` para que
// a camada de UI/Server Actions consiga decidir como responder (status code,
// mensagem amigável, etc).

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string) {
    super(`${resource} não encontrado`, "NOT_FOUND");
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Não autorizado") {
    super(message, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "Permissão negada") {
    super(message, "FORBIDDEN");
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, "VALIDATION");
  }
}

// Erro específico de reserva: alguém tentou reservar números já tomados.
// Carrega a lista de números em conflito para a UI mostrar.
export class ReservationConflictError extends DomainError {
  constructor(public readonly takenNumbers: number[]) {
    super(
      `Os números ${takenNumbers.join(", ")} já foram reservados.`,
      "RESERVATION_CONFLICT"
    );
  }
}
