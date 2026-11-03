package br.univates.medicalfield.clinico.comum;

import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

/**
 * Resposta dos cadastros (docs/06-api.md, seção 6.6). {@code resultado} é CRIADO (201),
 * JA_EXISTIA (200, reenvio do mesmo ID) ou UNIFICADO (200, era duplicado de um registro existente).
 */
public record ResultadoCadastro<T>(String resultado, UUID id, UUID idEnviado, UUID conflitoId, T dados) {

    public static <T> ResultadoCadastro<T> criado(UUID id, T dados) {
        return new ResultadoCadastro<>("CRIADO", id, id, null, dados);
    }

    public static <T> ResultadoCadastro<T> jaExistia(UUID id, T dados) {
        return new ResultadoCadastro<>("JA_EXISTIA", id, id, null, dados);
    }

    public static <T> ResultadoCadastro<T> unificado(UUID idMantido, UUID idEnviado, UUID conflitoId, T dados) {
        return new ResultadoCadastro<>("UNIFICADO", idMantido, idEnviado, conflitoId, dados);
    }

    public ResponseEntity<ResultadoCadastro<T>> comoResposta() {
        HttpStatus status = "CRIADO".equals(resultado) ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(this);
    }
}
