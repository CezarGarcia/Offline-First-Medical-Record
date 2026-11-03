package br.univates.medicalfield.clinico.comum;

import static java.lang.annotation.ElementType.FIELD;
import static java.lang.annotation.ElementType.PARAMETER;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.Target;

/** CPF com 11 dígitos (só números) e dígitos verificadores corretos. Vazio é aceito. */
@Documented
@Constraint(validatedBy = Cpf.Validador.class)
@Target({FIELD, PARAMETER})
@Retention(RUNTIME)
public @interface Cpf {

    String message() default "CPF inválido (use só os 11 números, com dígitos verificadores corretos)";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    final class Validador implements ConstraintValidator<Cpf, String> {

        @Override
        public boolean isValid(String valor, ConstraintValidatorContext contexto) {
            return valor == null || valido(valor);
        }

        public static boolean valido(String cpf) {
            if (!cpf.matches("\\d{11}") || cpf.chars().distinct().count() == 1) {
                return false;
            }
            return digito(cpf, 9) == cpf.charAt(9) - '0' && digito(cpf, 10) == cpf.charAt(10) - '0';
        }

        /** Dígito verificador calculado sobre os primeiros {@code quantidade} dígitos. */
        private static int digito(String cpf, int quantidade) {
            int soma = 0;
            for (int i = 0; i < quantidade; i++) {
                soma += (cpf.charAt(i) - '0') * (quantidade + 1 - i);
            }
            int resto = (soma * 10) % 11;
            return resto == 10 ? 0 : resto;
        }
    }
}
