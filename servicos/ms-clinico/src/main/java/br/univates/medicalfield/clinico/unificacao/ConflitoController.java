package br.univates.medicalfield.clinico.unificacao;

import br.univates.medicalfield.clinico.seguranca.SomenteAdmin;
import br.univates.medicalfield.clinico.unificacao.RepositorioUnificacoes.Conflito;
import io.swagger.v3.oas.annotations.Operation;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/conflito")
public class ConflitoController {

    private final RepositorioUnificacoes unificacoes;

    public ConflitoController(RepositorioUnificacoes unificacoes) {
        this.unificacoes = unificacoes;
    }

    @SomenteAdmin
    @GetMapping
    @Operation(summary = "Lista as unificações de duplicados (mais recente primeiro). Só administradores.")
    public List<Conflito> listar() {
        return unificacoes.listarConflitos();
    }
}
