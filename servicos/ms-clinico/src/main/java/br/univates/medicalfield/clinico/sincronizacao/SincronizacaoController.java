package br.univates.medicalfield.clinico.sincronizacao;

import br.univates.medicalfield.clinico.erros.Detalhe;
import br.univates.medicalfield.clinico.erros.ErroApi;
import br.univates.medicalfield.clinico.sincronizacao.ServicoSincronizacao.RespostaPull;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sync")
public class SincronizacaoController {

    private final ServicoSincronizacao servico;

    public SincronizacaoController(ServicoSincronizacao servico) {
        this.servico = servico;
    }

    @GetMapping("/pull")
    @Operation(summary = "O que mudou no servidor desde o cursor (\"receber dados\" do app cliente)")
    public RespostaPull pull(
            @Parameter(description = "Cursor devolvido no pull anterior. Vazio: traz tudo.")
            @RequestParam(required = false) String desde) {
        return servico.mudancasDesde(lerCursor(desde));
    }

    private static Instant lerCursor(String desde) {
        if (desde == null || desde.isBlank()) {
            return null;
        }
        try {
            return OffsetDateTime.parse(desde.strip()).toInstant();
        } catch (DateTimeParseException e) {
            throw ErroApi.validacao(List.of(new Detalhe("desde", "formato inválido (esperado: data/hora ISO 8601)")));
        }
    }
}
