package br.univates.medicalfield.clinico.erros;

import java.util.List;
import org.springframework.http.HttpStatus;

/** Erro de negócio que vira a resposta padrão da API. */
public class ErroApi extends RuntimeException {

    private final HttpStatus status;
    private final String codigo;
    private final List<Detalhe> detalhes;

    public ErroApi(HttpStatus status, String codigo, String mensagem, List<Detalhe> detalhes) {
        super(mensagem);
        this.status = status;
        this.codigo = codigo;
        this.detalhes = List.copyOf(detalhes);
    }

    public static ErroApi validacao(List<Detalhe> detalhes) {
        return new ErroApi(HttpStatus.BAD_REQUEST, "VALIDACAO", "Há campos inválidos.", detalhes);
    }

    public static ErroApi naoAutenticado() {
        return new ErroApi(HttpStatus.UNAUTHORIZED, "NAO_AUTENTICADO",
                "Token ausente, inválido ou vencido. Faça login novamente.", List.of());
    }

    public static ErroApi proibido() {
        return new ErroApi(HttpStatus.FORBIDDEN, "PROIBIDO", "Esta rota é restrita a administradores.", List.of());
    }

    public static ErroApi naoEncontrado(String mensagem) {
        return new ErroApi(HttpStatus.NOT_FOUND, "NAO_ENCONTRADO", mensagem, List.of());
    }

    /** 422: o corpo está bem formado, mas referencia algo que não existe. */
    public static ErroApi referencia(String codigo, String mensagem) {
        return new ErroApi(HttpStatus.UNPROCESSABLE_CONTENT, codigo, mensagem, List.of());
    }

    public HttpStatus status() {
        return status;
    }

    public RespostaDeErro corpo() {
        return new RespostaDeErro(codigo, getMessage(), detalhes);
    }
}
