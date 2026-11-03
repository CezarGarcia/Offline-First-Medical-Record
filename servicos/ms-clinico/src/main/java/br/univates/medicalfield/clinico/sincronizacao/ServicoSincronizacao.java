package br.univates.medicalfield.clinico.sincronizacao;

import br.univates.medicalfield.clinico.atendimento.Atendimento;
import br.univates.medicalfield.clinico.atendimento.RepositorioAtendimentos;
import br.univates.medicalfield.clinico.comum.Valores;
import br.univates.medicalfield.clinico.medicamento.Medicamento;
import br.univates.medicalfield.clinico.medicamento.RepositorioMedicamentos;
import br.univates.medicalfield.clinico.pessoa.Pessoa;
import br.univates.medicalfield.clinico.pessoa.RepositorioPessoas;
import br.univates.medicalfield.clinico.prontuario.Prontuario;
import br.univates.medicalfield.clinico.prontuario.RepositorioProntuarios;
import br.univates.medicalfield.clinico.unificacao.RepositorioUnificacoes;
import br.univates.medicalfield.clinico.unificacao.RepositorioUnificacoes.Unificacao;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * "Receber dados" do app cliente (docs/07-sincronizacao.md, seção 7.7): tudo que mudou no servidor
 * desde o cursor, com uma margem de segurança, numa foto consistente do banco.
 */
@Service
public class ServicoSincronizacao {

    private final JdbcClient jdbc;
    private final RepositorioMedicamentos medicamentos;
    private final RepositorioPessoas pessoas;
    private final RepositorioProntuarios prontuarios;
    private final RepositorioAtendimentos atendimentos;
    private final RepositorioUnificacoes unificacoes;

    public ServicoSincronizacao(JdbcClient jdbc, RepositorioMedicamentos medicamentos, RepositorioPessoas pessoas,
                                RepositorioProntuarios prontuarios, RepositorioAtendimentos atendimentos,
                                RepositorioUnificacoes unificacoes) {
        this.jdbc = jdbc;
        this.medicamentos = medicamentos;
        this.pessoas = pessoas;
        this.prontuarios = prontuarios;
        this.atendimentos = atendimentos;
        this.unificacoes = unificacoes;
    }

    public record RespostaPull(
            String cursor,
            List<Medicamento> medicamentos,
            List<Pessoa> pessoas,
            List<Prontuario> prontuarios,
            List<Atendimento> atendimentos,
            List<Unificacao> unificacoes) {
    }

    /**
     * @param desde cursor devolvido no pull anterior; vazio na primeira vez (traz tudo)
     */
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public RespostaPull mudancasDesde(Instant desde) {
        // now() é a hora de início da transação: vira o próximo cursor
        Instant agora = jdbc.sql("SELECT now()").query(OffsetDateTime.class).single().toInstant();
        Instant limite = desde == null ? Instant.EPOCH : desde.minus(Valores.MARGEM_PULL);
        return new RespostaPull(
                agora.toString(),
                medicamentos.alteradosDesde(limite),
                pessoas.alteradasDesde(limite),
                prontuarios.alteradosDesde(limite),
                atendimentos.alteradosDesde(limite),
                unificacoes.alteradasDesde(limite));
    }
}
