package br.univates.medicalfield.clinico.atendimento;

import br.univates.medicalfield.clinico.comum.Autor;
import br.univates.medicalfield.clinico.comum.ResultadoCadastro;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/atendimento")
public class AtendimentoController {

    private final ServicoAtendimentos servico;

    public AtendimentoController(ServicoAtendimentos servico) {
        this.servico = servico;
    }

    @GetMapping
    @Operation(summary = "Lista todos os atendimentos (resumo), do mais recente para o mais antigo")
    public List<Atendimento.Resumo> listar() {
        return servico.listar();
    }

    @GetMapping("/{id}")
    @Operation(summary = "Todos os atendimentos de uma pessoa")
    public List<Atendimento> daPessoa(@Parameter(description = "ID da PESSOA (como na tabela do enunciado)") @PathVariable UUID id) {
        return servico.daPessoa(id);
    }

    @GetMapping("/detalhe/{id}")
    @Operation(summary = "Um atendimento completo, com a pessoa e o prontuário")
    public Atendimento detalhe(@Parameter(description = "ID do atendimento") @PathVariable UUID id) {
        return servico.detalhe(id);
    }

    @PostMapping
    @Operation(summary = "Cadastra atendimento com os medicamentos administrados. Reenvio do mesmo id: JA_EXISTIA.")
    public ResponseEntity<ResultadoCadastro<Atendimento>> cadastrar(@Valid @RequestBody AtendimentoEntrada entrada,
                                                                    HttpServletRequest requisicao) {
        return servico.cadastrar(entrada, Autor.de(requisicao)).comoResposta();
    }
}
