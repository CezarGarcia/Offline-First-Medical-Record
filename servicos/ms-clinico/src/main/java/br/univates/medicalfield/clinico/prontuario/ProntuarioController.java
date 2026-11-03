package br.univates.medicalfield.clinico.prontuario;

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
@RequestMapping("/api/prontuario")
public class ProntuarioController {

    private final ServicoProntuarios servico;

    public ProntuarioController(ServicoProntuarios servico) {
        this.servico = servico;
    }

    @GetMapping
    @Operation(summary = "Lista todos os prontuários de todas as pessoas, cada um com o resumo da pessoa")
    public List<Prontuario> listar() {
        return servico.listar();
    }

    @GetMapping("/{id}")
    @Operation(summary = "Prontuário de uma pessoa, com os dados completos dela")
    public Prontuario daPessoa(@Parameter(description = "ID da PESSOA (como na tabela do enunciado)") @PathVariable UUID id) {
        return servico.daPessoa(id);
    }

    @PostMapping
    @Operation(summary = "Cadastra prontuário. Reenvio: JA_EXISTIA. Pessoa que já tem prontuário: UNIFICADO.")
    public ResponseEntity<ResultadoCadastro<Prontuario>> cadastrar(@Valid @RequestBody ProntuarioEntrada entrada,
                                                                   HttpServletRequest requisicao) {
        return servico.cadastrar(entrada, Autor.de(requisicao)).comoResposta();
    }
}
