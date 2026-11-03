package br.univates.medicalfield.clinico.prontuario;

import br.univates.medicalfield.clinico.comum.Autor;
import br.univates.medicalfield.clinico.comum.Banco;
import br.univates.medicalfield.clinico.comum.Origem;
import br.univates.medicalfield.clinico.comum.ResultadoCadastro;
import br.univates.medicalfield.clinico.comum.Uuids;
import br.univates.medicalfield.clinico.comum.Verificacao;
import br.univates.medicalfield.clinico.erros.ErroApi;
import br.univates.medicalfield.clinico.pessoa.Pessoa;
import br.univates.medicalfield.clinico.pessoa.RepositorioPessoas;
import br.univates.medicalfield.clinico.prontuario.RepositorioProntuarios.NovoProntuario;
import br.univates.medicalfield.clinico.prontuario.RepositorioProntuarios.ParaMesclar;
import br.univates.medicalfield.clinico.unificacao.Mesclador;
import br.univates.medicalfield.clinico.unificacao.Mesclador.Mesclagem;
import br.univates.medicalfield.clinico.unificacao.RepositorioUnificacoes;
import br.univates.medicalfield.clinico.unificacao.RepositorioUnificacoes.Apelido;
import br.univates.medicalfield.clinico.unificacao.RepositorioUnificacoes.NovoConflito;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Cadastro de prontuário (um por pessoa), com idempotência e unificação de prontuário repetido. */
@Service
public class ServicoProntuarios {

    private final RepositorioProntuarios prontuarios;
    private final RepositorioPessoas pessoas;
    private final RepositorioUnificacoes unificacoes;
    private final Mesclador mesclador;

    public ServicoProntuarios(RepositorioProntuarios prontuarios, RepositorioPessoas pessoas,
                              RepositorioUnificacoes unificacoes, Mesclador mesclador) {
        this.prontuarios = prontuarios;
        this.pessoas = pessoas;
        this.unificacoes = unificacoes;
        this.mesclador = mesclador;
    }

    public List<Prontuario> listar() {
        return prontuarios.listarComPessoa();
    }

    /** Prontuário de uma pessoa ({@code pessoaId} pode ser um ID descartado numa unificação). */
    @Transactional(readOnly = true)
    public Prontuario daPessoa(UUID pessoaId) {
        UUID id = unificacoes.resolver(pessoaId, RepositorioUnificacoes.PESSOA);
        Pessoa pessoa = pessoas.buscar(id).orElseThrow(() -> ErroApi.naoEncontrado("Pessoa não encontrada."));
        return prontuarios.buscarPorPessoa(id)
                .orElseThrow(() -> ErroApi.naoEncontrado("Esta pessoa não tem prontuário."))
                .comPessoa(pessoa);
    }

    @Transactional
    public ResultadoCadastro<Prontuario> cadastrar(ProntuarioEntrada entrada, Autor autor) {
        Verificacao verificacao = new Verificacao();
        Origem origem = autor.origemPara(entrada.origem(), Instant.now(), verificacao);
        verificacao.lancarSeHouverErros();
        UUID id = entrada.id() != null ? entrada.id() : Uuids.v7();

        Optional<Apelido> apelido = unificacoes.buscarApelido(id, RepositorioUnificacoes.PRONTUARIO);
        if (apelido.isPresent()) {
            return unificado(apelido.get());
        }
        Optional<Prontuario> existente = prontuarios.buscar(id);
        if (existente.isPresent()) {
            return ResultadoCadastro.jaExistia(id, existente.get());
        }

        UUID pessoaId = unificacoes.resolver(entrada.pessoaId(), RepositorioUnificacoes.PESSOA);
        if (!pessoas.existe(pessoaId)) {
            throw ErroApi.referencia("PESSOA_NAO_ENCONTRADA", "A pessoa " + entrada.pessoaId() + " não existe.");
        }
        NovoProntuario novo = new NovoProntuario(id, pessoaId, valores(entrada), origem, autor.profissional().id());
        if (prontuarios.inserir(novo) == 1) {
            return ResultadoCadastro.criado(id, prontuarios.buscar(id).orElseThrow());
        }

        // Não entrou: o mesmo ID chegou ao mesmo tempo, ou a pessoa já tem prontuário
        Optional<Prontuario> chegouJunto = prontuarios.buscar(id);
        if (chegouJunto.isPresent()) {
            return ResultadoCadastro.jaExistia(id, chegouJunto.get());
        }
        ParaMesclar alvo = prontuarios.travarPorPessoa(pessoaId)
                .orElseThrow(() -> new IllegalStateException("Cadastro de prontuário recusado sem motivo aparente"));
        Optional<Apelido> unificadoEnquantoEsperava = unificacoes.buscarApelido(id, RepositorioUnificacoes.PRONTUARIO);
        if (unificadoEnquantoEsperava.isPresent()) {
            return unificado(unificadoEnquantoEsperava.get());
        }
        return unificar(alvo, novo, entrada, origem, autor);
    }

    private ResultadoCadastro<Prontuario> unificar(ParaMesclar alvo, NovoProntuario novo, ProntuarioEntrada entrada,
                                                   Origem origem, Autor autor) {
        Mesclagem mesclagem = mesclador.mesclar(RepositorioProntuarios.CAMPOS_MESCLAVEIS, alvo.valores(),
                alvo.carimbos(), alvo.criadoEm(), novo.valores(), origem.criadoEm());
        prontuarios.aplicarMesclagem(alvo.id(), mesclagem.valores(), mesclagem.carimbos());

        Map<String, Object> recebido = new LinkedHashMap<>();
        recebido.put("id", novo.id());
        recebido.put("dados", entrada);
        recebido.put("origem", origem);
        UUID conflitoId = unificacoes.registrarConflito(new NovoConflito(
                RepositorioUnificacoes.PRONTUARIO, "PRONTUARIO_DUPLICADO", alvo.id(), novo.id(),
                mesclador.estrategia().nome(), mesclagem.diferencas(), recebido, autor.profissional().id(),
                origem.dispositivoId(), origem.dispositivoNome()));
        unificacoes.registrarApelido(novo.id(), alvo.id(), RepositorioUnificacoes.PRONTUARIO, conflitoId);
        return ResultadoCadastro.unificado(alvo.id(), novo.id(), conflitoId, prontuarios.buscar(alvo.id()).orElseThrow());
    }

    private ResultadoCadastro<Prontuario> unificado(Apelido apelido) {
        return ResultadoCadastro.unificado(apelido.idMantido(), apelido.idDescartado(), apelido.conflitoId(),
                prontuarios.buscar(apelido.idMantido()).orElseThrow());
    }

    private static Map<String, String> valores(ProntuarioEntrada e) {
        Map<String, String> valores = new LinkedHashMap<>();
        valores.put("tipo_sanguineo", e.tipoSanguineo());
        valores.put("alergias", Banco.limpar(e.alergias()));
        valores.put("comorbidades", Banco.limpar(e.comorbidades()));
        valores.put("medicamentos_uso_continuo", Banco.limpar(e.medicamentosUsoContinuo()));
        valores.put("observacoes", Banco.limpar(e.observacoes()));
        return valores;
    }
}
