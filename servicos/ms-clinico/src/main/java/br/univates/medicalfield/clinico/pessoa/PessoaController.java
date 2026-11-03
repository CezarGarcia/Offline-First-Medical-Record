package br.univates.medicalfield.clinico.pessoa;

import br.univates.medicalfield.clinico.comum.Autor;
import br.univates.medicalfield.clinico.comum.ResultadoCadastro;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/pessoa")
public class PessoaController {

    private final ServicoPessoas servico;

    public PessoaController(ServicoPessoas servico) {
        this.servico = servico;
    }

    @GetMapping
    @Operation(summary = "Lista as pessoas, em ordem de nome")
    public List<Pessoa> listar() {
        return servico.listar();
    }

    @PostMapping
    @Operation(summary = "Cadastra pessoa. Reenvio do mesmo id: JA_EXISTIA. CPF já cadastrado: UNIFICADO.")
    public ResponseEntity<ResultadoCadastro<Pessoa>> cadastrar(@Valid @RequestBody PessoaEntrada entrada,
                                                               HttpServletRequest requisicao) {
        return servico.cadastrar(entrada, Autor.de(requisicao)).comoResposta();
    }
}
