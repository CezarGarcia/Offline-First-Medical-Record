package br.univates.medicalfield.clinico.erros;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/** Formato padrão de erro dos três serviços (docs/06-api.md, seção 6.5). */
public record RespostaDeErro(String erro, String mensagem, @JsonInclude(JsonInclude.Include.NON_EMPTY) List<Detalhe> detalhes) {

    public RespostaDeErro(String erro, String mensagem) {
        this(erro, mensagem, List.of());
    }
}
