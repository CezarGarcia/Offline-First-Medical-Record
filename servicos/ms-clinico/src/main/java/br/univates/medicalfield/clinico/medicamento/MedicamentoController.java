package br.univates.medicalfield.clinico.medicamento;

import io.swagger.v3.oas.annotations.Operation;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/medicamento")
public class MedicamentoController {

    private final RepositorioMedicamentos medicamentos;

    public MedicamentoController(RepositorioMedicamentos medicamentos) {
        this.medicamentos = medicamentos;
    }

    @GetMapping
    @Operation(summary = "Lista todos os medicamentos do catálogo (os inativos vêm com ativo = false)")
    public List<Medicamento> listar() {
        return medicamentos.listar();
    }
}
