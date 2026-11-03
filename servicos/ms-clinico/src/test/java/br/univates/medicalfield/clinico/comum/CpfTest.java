package br.univates.medicalfield.clinico.comum;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class CpfTest {

    @Test
    void aceitaCpfsComDigitosVerificadoresCertos() {
        assertThat(Cpf.Validador.valido("52998224725")).isTrue();
        assertThat(Cpf.Validador.valido("11144477735")).isTrue();
    }

    @Test
    void recusaDigitoErradoTamanhoErradoPontuacaoERepeticao() {
        assertThat(Cpf.Validador.valido("52998224724")).isFalse();
        assertThat(Cpf.Validador.valido("5299822472")).isFalse();
        assertThat(Cpf.Validador.valido("529.982.247-25")).isFalse();
        assertThat(Cpf.Validador.valido("11111111111")).isFalse();
    }
}
