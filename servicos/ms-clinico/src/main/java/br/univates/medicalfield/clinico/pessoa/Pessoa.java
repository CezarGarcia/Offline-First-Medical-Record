package br.univates.medicalfield.clinico.pessoa;

import br.univates.medicalfield.clinico.comum.Origem;
import br.univates.medicalfield.clinico.comum.Sincronizacao;
import java.time.LocalDate;
import java.util.UUID;

/** Pessoa (paciente), como a API devolve. */
public record Pessoa(
        UUID id,
        String nome,
        String cpf,
        LocalDate dataNascimento,
        String sexo,
        String telefone,
        String email,
        Contato contato,
        Origem origem,
        Sincronizacao sincronizacao) {

    public record Contato(String nome, String parentesco, String telefone, String email) {
    }

    /** Resumo usado dentro das listas de prontuários e atendimentos. */
    public record Resumo(UUID id, String nome, String cpf) {
    }
}
