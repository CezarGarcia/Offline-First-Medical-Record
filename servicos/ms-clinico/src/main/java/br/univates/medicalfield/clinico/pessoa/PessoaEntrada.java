package br.univates.medicalfield.clinico.pessoa;

import br.univates.medicalfield.clinico.comum.Cpf;
import br.univates.medicalfield.clinico.comum.OrigemEntrada;
import br.univates.medicalfield.clinico.comum.Valores;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.UUID;

/** Corpo de POST /api/pessoa (docs/06-api.md, seção 6.4). {@code id} e {@code origem} são opcionais. */
public record PessoaEntrada(
        UUID id,
        @NotBlank @Size(max = 200) String nome,
        @Cpf String cpf,
        @PastOrPresent LocalDate dataNascimento,
        @Pattern(regexp = Valores.SEXO, message = Valores.MSG_SEXO) String sexo,
        @Size(max = 30) String telefone,
        @Email @Size(max = 200) String email,
        @Valid Contato contato,
        @Valid OrigemEntrada origem) {

    public record Contato(
            @Size(max = 200) String nome,
            @Size(max = 50) String parentesco,
            @Size(max = 30) String telefone,
            @Email @Size(max = 200) String email) {
    }
}
