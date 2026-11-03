package br.univates.medicalfield.clinico.unificacao;

import static org.assertj.core.api.Assertions.assertThat;

import br.univates.medicalfield.clinico.pessoa.RepositorioPessoas;
import br.univates.medicalfield.clinico.prontuario.RepositorioProntuarios;
import br.univates.medicalfield.clinico.unificacao.Mesclador.Mesclagem;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Regras de mesclagem campo a campo e as duas estratégias (Strategy), sem banco. */
class MescladorTest {

    private static final Instant AS_10_00 = Instant.parse("2026-11-03T10:00:00Z");
    private static final Instant AS_10_15 = Instant.parse("2026-11-03T10:15:00Z");
    private static final Instant AS_10_30 = Instant.parse("2026-11-03T10:30:00Z");

    private static Map<String, String> pessoa(String nome, String telefone, String email) {
        Map<String, String> valores = new HashMap<>();
        valores.put("nome", nome);
        valores.put("telefone", telefone);
        valores.put("email", email);
        return valores;
    }

    @Test
    void campoVazioNoExistenteEhComplementadoEValoresIguaisNaoGeramDiferenca() {
        Mesclagem m = new Mesclador(new MaisRecenteVence()).mesclar(RepositorioPessoas.CAMPOS_MESCLAVEIS,
                pessoa("João", "1111", null), Map.of(), AS_10_00,
                pessoa("João", "1111", "joao@exemplo.com"), AS_10_30);

        assertThat(m.valores()).containsEntry("email", "joao@exemplo.com").containsEntry("telefone", "1111");
        assertThat(m.diferencas()).containsExactly(
                new Diferenca("email", "COMPLEMENTO", "joao@exemplo.com", null, "RECEBIDO"));
        assertThat(m.carimbos()).containsEntry("email", AS_10_30);
    }

    @Test
    void campoPreenchidoSoNoExistenteNaoMuda() {
        Mesclagem m = new Mesclador(new MaisRecenteVence()).mesclar(RepositorioPessoas.CAMPOS_MESCLAVEIS,
                pessoa("João", "1111", "joao@exemplo.com"), Map.of(), AS_10_00, pessoa("João", null, " "), AS_10_30);

        assertThat(m.valores()).containsEntry("telefone", "1111").containsEntry("email", "joao@exemplo.com");
        assertThat(m.diferencas()).isEmpty();
    }

    @Test
    void maisRecenteVence_oRecebidoMaisNovoGanhaOConflito() {
        Mesclagem m = new Mesclador(new MaisRecenteVence()).mesclar(RepositorioPessoas.CAMPOS_MESCLAVEIS,
                pessoa("João da Silva", "1111", null), Map.of(), AS_10_00, pessoa("João Silva", "2222", null), AS_10_30);

        assertThat(m.valores()).containsEntry("nome", "João Silva").containsEntry("telefone", "2222");
        assertThat(m.diferencas()).containsExactly(
                new Diferenca("nome", "CONFLITO", "João Silva", "João da Silva", "RECEBIDO"),
                new Diferenca("telefone", "CONFLITO", "2222", "1111", "RECEBIDO"));
    }

    @Test
    void maisRecenteVence_oRecebidoMaisVelhoPerdeMasFicaRegistrado() {
        Mesclagem m = new Mesclador(new MaisRecenteVence()).mesclar(RepositorioPessoas.CAMPOS_MESCLAVEIS,
                pessoa("João", "2222", null), Map.of(), AS_10_30, pessoa("João", "1111", null), AS_10_00);

        assertThat(m.valores()).containsEntry("telefone", "2222");
        assertThat(m.diferencas()).containsExactly(new Diferenca("telefone", "CONFLITO", "2222", "1111", "EXISTENTE"));
    }

    @Test
    void servidorVence_mantemOExistenteNoConflitoMasAindaComplementa() {
        Mesclagem m = new Mesclador(new ServidorVence()).mesclar(RepositorioPessoas.CAMPOS_MESCLAVEIS,
                pessoa("João", "1111", null), Map.of(), AS_10_00, pessoa("João", "2222", "joao@exemplo.com"), AS_10_30);

        assertThat(m.valores()).containsEntry("telefone", "1111").containsEntry("email", "joao@exemplo.com");
        assertThat(m.diferencas()).extracting(Diferenca::tipo, Diferenca::origemDoValor)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("CONFLITO", "EXISTENTE"),
                        org.assertj.core.groups.Tuple.tuple("COMPLEMENTO", "RECEBIDO"));
    }

    @Test
    void desconhecidoENaoInformadoContamComoVazios() {
        Map<String, String> existente = new HashMap<>(Map.of("tipo_sanguineo", "DESCONHECIDO"));
        Mesclagem m = new Mesclador(new ServidorVence()).mesclar(RepositorioProntuarios.CAMPOS_MESCLAVEIS,
                existente, Map.of(), AS_10_00, Map.of("tipo_sanguineo", "O+"), AS_10_30);

        assertThat(m.valores()).containsEntry("tipo_sanguineo", "O+");
        assertThat(m.diferencas()).containsExactly(
                new Diferenca("tipoSanguineo", "COMPLEMENTO", "O+", "DESCONHECIDO", "RECEBIDO"));
    }

    /** O exemplo de docs/07-sincronizacao.md: cada campo lembra de quando veio o seu valor. */
    @Test
    void carimbosPorCampoMantemARegraCertaNumTerceiroDuplicado() {
        Map<String, Instant> carimbos = Map.of("telefone", AS_10_30, "email", AS_10_00);
        Mesclagem m = new Mesclador(new MaisRecenteVence()).mesclar(RepositorioPessoas.CAMPOS_MESCLAVEIS,
                pessoa("João", "2222", "antigo@exemplo.com"), carimbos, AS_10_00,
                pessoa("João", "3333", "novo@exemplo.com"), AS_10_15);

        assertThat(m.valores()).containsEntry("email", "novo@exemplo.com").containsEntry("telefone", "2222");
        assertThat(m.carimbos()).containsEntry("email", AS_10_15).containsEntry("telefone", AS_10_30);
    }
}
